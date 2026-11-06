// The 3D view: drawing, the Polish view, the Advisor-style panel and outside checks.
'use strict';
/* ---------- WebGL ---------- */
const gl=document.getElementById('gl').getContext('webgl',{antialias:true,alpha:true});
const cam={M:[[1,0,0],[0,1,0],[0,0,1]],zoom:1,center:[0,0,0],scale:1,panX:0,panY:0};
let drawn={stone:null,inc:[],stoneN:0,plan:[],saw:null,sawN:0,outside:null,outsideN:0,near:null,nearN:0};
const INC_COLORS={ignored:[.86,.12,.12],auto:[.92,.84,.2],selected:[.1,.66,.2],inside:[.62,.25,.9],outside:[1,.55,.1]};
const incGroup=i=>i.ignored?'ignored':i.auto?'auto':'selected';
const VIEW_TURN=Math.PI/2;
const AUTO_COUNTS=3,SURFACE_CELL=100,SURFACE_STEP=40,PIN_REACH=.25,NEAR_PIXELS=8,SPLIT_ID_BASE=1000000,SAW_TURN=.006;
let insideColors=false,polishView=false,projView=false,polishInc=true,autoFinished=null,autoWorkers=[],onlyStone=null,insideOnly=null,beforeOnly=null,pickMode=false,diamondHidden=false,shownPhoto=null,frameGoal=null,frameGoalDir=1,frameBusy=false,aheadTicket=0,insetTimer=0,frameTicket=0,openUrls=[],spinStep=0,rotMode='free',scanMode=false,frameAt=0,frameDrag=null;
const PLAN_COLORS=[[.3,.42,1],[1,.28,.2],[.2,.85,.5]];
const program=gl&&(()=>{
  const vs=`attribute vec3 p;attribute vec3 n;uniform mat3 R;uniform vec3 c;uniform vec2 s;uniform vec2 o;uniform float d;varying vec3 vn;
  void main(){vec3 q=R*(p-c);vn=R*n;gl_Position=vec4(q.x*s.x+o.x,q.y*s.y+o.y,-q.z*d,1.);}`;
  const fs=`precision mediump float;varying vec3 vn;uniform vec3 col;uniform float glass;
  void main(){vec3 n=normalize(vn);float f=abs(n.z);
  if(glass>2.5){gl_FragColor=vec4(col,1.);}
  else if(glass>1.5){gl_FragColor=vec4(col*(.45+.55*f),.72);}
  else if(glass>.5){float a=mix(.5,.05,f);gl_FragColor=vec4(col*(.55+.45*f),a);}
  else{gl_FragColor=vec4(col*(.35+.65*f),1.);}}`;
  const mk=(t,src)=>{const o=gl.createShader(t);gl.shaderSource(o,src);gl.compileShader(o);return o};
  const pr=gl.createProgram();
  gl.attachShader(pr,mk(gl.VERTEX_SHADER,vs));gl.attachShader(pr,mk(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(pr);gl.useProgram(pr);return pr;
})();
function bake(meshes){
  let n=0;for(const m of meshes)n+=m.tris.length;
  const out=new Float32Array(n*6);let o=0;
  for(const m of meshes){
    const p=m.pos,t=m.tris;
    for(let i=0;i<t.length;i+=3){
      const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;
      const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
      for(const q of[a,b,c]){out[o++]=p[q];out[o++]=p[q+1];out[o++]=p[q+2];out[o++]=nx;out[o++]=ny;out[o++]=nz}
    }
  }
  return{data:out,count:n};
}
function activeStones(s){return s.ownPlan?s.ownPlan:s.plannedStones}
// Each saw is drawn as the two faces of the plate, cut through the rough outline. Where a saw ends at another,
// the line is cut exactly there, so saws meet and never overlap.
// Keeps the parts of lines on the inner side of a plane [nx,ny,nz,d].
function keepSide(parts,c){
  const next=[];
  for(const [a,b] of parts){
    const ea=a[0]*c[0]+a[1]*c[1]+a[2]*c[2]-c[3],eb=b[0]*c[0]+b[1]*c[1]+b[2]*c[2]-c[3];
    if(ea>=0&&eb>=0)next.push([a,b]);
    else if(ea>=0||eb>=0){const t=ea/(ea-eb),m=[0,1,2].map(k=>a[k]+(b[k]-a[k])*t);next.push(ea>=0?[a,m]:[m,b])}
  }
  return next;
}
// Drops the parts of lines inside a region made of several planes.
function dropInside(parts,planes){
  for(const c of planes){
    const next=[];
    for(const [a,b] of parts){
      const ea=a[0]*c[0]+a[1]*c[1]+a[2]*c[2]-c[3],eb=b[0]*c[0]+b[1]*c[1]+b[2]*c[2]-c[3];
      if(ea*eb>=0)next.push([a,b]);
      else{const t=ea/(ea-eb),m=[0,1,2].map(k=>a[k]+(b[k]-a[k])*t);next.push([a,m],[m,b])}
    }
    parts=next;
  }
  return parts.filter(([a,b])=>{const m=[0,1,2].map(k=>(a[k]+b[k])/2);return!planes.every(c=>m[0]*c[0]+m[1]*c[1]+m[2]*c[2]>=c[3])});
}
// Each plate has two faces, its thickness apart. A face ends on the matching face of the next plate, so corners join exactly.
function sawFaces(s,saw,width){
  const lines=[],half=width/2;
  for(const side of [-half,half])for(const seg of sawCut(s.stone,saw.normal,saw.offset+side)){
    let parts=[seg];
    for(const c of saw.within)parts=keepSide(parts,c);
    if(saw.around){
      // Plates of a bent cut: the inner faces meet inside the bend, the outer faces outside it.
      const inner=side*saw.around>0,shift=inner?half:-half;
      for(const c of saw.stops)parts=keepSide(parts,[c[0],c[1],c[2],c[3]+shift]);
      if(!inner)for(const w of saw.cross){
        const n=w.normal;
        parts=dropInside(parts,[[n[0],n[1],n[2],w.offset-half],[-n[0],-n[1],-n[2],-w.offset-half]]);
      }
    }else{
      for(const c of saw.stops||[])parts=keepSide(parts,c);
      // A saw stops on the outer faces of the bent cut.
      if(saw.avoid?.length)parts=dropInside(parts,saw.avoid.map(c=>[c[0],c[1],c[2],c[3]-half]));
    }
    lines.push(...parts);
  }
  return lines;
}
function sawLines(s){
  if(!s.stone)return[];
  if(s.ownPlan)return(s.ownSaws||[]).flatMap(saw=>sawFaces(s,saw,s.ownSawWidth));
  return(s.fileSaws||[]).flatMap(saw=>sawFaces(s,saw,saw.width));
}
// Splits the rough's surface along the plates, so each piece can take the colour of its stone.
function cutSurface(P,T,plates){
  let tris=[];
  for(let i=0;i<T.length;i+=3)tris.push([T[i],T[i+1],T[i+2]].map(v=>[P[v*3],P[v*3+1],P[v*3+2]]));
  for(const w of plates){
    const n=w.normal,next=[];
    for(const t of tris){
      const e=t.map(q=>q[0]*n[0]+q[1]*n[1]+q[2]*n[2]-w.offset);
      if(e.every(v=>v>=0)||e.every(v=>v<=0)){next.push(t);continue}
      const k=e.findIndex((v,i)=>(v>=0)!==(e[(i+1)%3]>=0)&&(v>=0)!==(e[(i+2)%3]>=0)),[a,b,c]=[t[k],t[(k+1)%3],t[(k+2)%3]],[ea,eb,ec]=[e[k],e[(k+1)%3],e[(k+2)%3]];
      const ab=a.map((v,m)=>v+(b[m]-v)*ea/(ea-eb)),ac=a.map((v,m)=>v+(c[m]-v)*ea/(ea-ec));
      next.push([a,ab,ac],[ab,b,c],[ab,c,ac]);
    }
    tris=next;
  }
  return tris;
}
// Which stone's part a point of the rough belongs to: the stone it shares a side with on every plate that misses that stone.
function partOf(q,plates,sides,stones){
  let best=0,top=-Infinity;
  stones.forEach((r,i)=>{
    let fit=0;
    plates.forEach((w,k)=>{
      const side=sides[i][k];
      if(side&&(q[0]*w.normal[0]+q[1]*w.normal[1]+q[2]*w.normal[2]-w.offset)*side>0)fit++;
      else if(side)fit-=2;
    });
    const near=-Math.hypot(q[0]-r.center[0],q[1]-r.center[1],q[2]-r.center[2])/r.D;
    if(fit+near*.01>top){top=fit+near*.01;best=i}
  });
  return best;
}
function trisBuffer(list){
  const data=new Float32Array(list.length*18);
  list.forEach((t,i)=>{
    const u=[0,1,2].map(k=>t[1][k]-t[0][k]),v=[0,1,2].map(k=>t[2][k]-t[0][k]),n=unit(cross(u,v));
    t.forEach((q,k)=>data.set([q[0],q[1],q[2],n[0],n[1],n[2]],i*18+k*6));
  });
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  return{buf,n:list.length*3};
}
function uploadSaw(s){
  for(const b of [drawn.saw,drawn.sawBand?.buf,...(drawn.sawFill||[]).map(p=>p.buf),...(drawn.parts||[]).map(p=>p.buf)])if(b)gl.deleteBuffer(b);
  drawn.saw=null;drawn.sawN=0;drawn.sawFill=[];drawn.sawBand=null;drawn.parts=[];
  const cut=sawLines(s);
  if(!cut.length)return;
  const L=new Float32Array(cut.length*12);
  cut.forEach((seg,i)=>seg.forEach((q,k)=>L.set([q[0],q[1],q[2],0,0,1],i*12+k*6)));
  drawn.saw=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,drawn.saw);gl.bufferData(gl.ARRAY_BUFFER,L,gl.STATIC_DRAW);drawn.sawN=cut.length*2;
  const plates=s.ownPlan?s.ownSaws||[]:s.fileSaws||[],stones=activeStones(s),fill=stones.map(()=>[]),band=[];
  for(const w of plates){
    const segs=sawFaces(s,w,0),n=w.normal,half=Math.max(w.width||s.ownSawWidth||0,SAW_BAND)/2;
    if(!segs.length)continue;
    const c=[0,1,2].map(k=>segs.reduce((t,e)=>t+e[0][k]+e[1][k],0)/segs.length/2);
    // The sheet takes the colour of the smaller of the stones nearest to it, as Advisor tints its plates.
    const gap=r=>{let least=Infinity;const P=r.mesh.pos;for(let i=0;i<P.length;i+=3)least=Math.min(least,Math.abs(P[i]*n[0]+P[i+1]*n[1]+P[i+2]*n[2]-w.offset));return least};
    const near=stones.map((r,i)=>({r,i,g:gap(r)})).sort((a,b)=>a.g-b.g).slice(0,2).sort((a,b)=>a.r.D-b.r.D)[0].i;
    for(const [a,b] of segs){
      fill[near].push([c,a,b]);
      const at=(q,d)=>q.map((v,k)=>v+n[k]*d);
      band.push([at(a,half),at(b,half),at(b,-half)],[at(a,half),at(b,-half),at(a,-half)]);
    }
  }
  drawn.sawFill=fill.map((g,i)=>g.length?{...trisBuffer(g),i}:null).filter(Boolean);drawn.sawBand=trisBuffer(band);
  const sides=stones.map(r=>plates.map(w=>{
    let lo=Infinity,hi=-Infinity;const P=r.mesh.pos;
    for(let i=0;i<P.length;i+=3){const v=P[i]*w.normal[0]+P[i+1]*w.normal[1]+P[i+2]*w.normal[2]-w.offset;if(v<lo)lo=v;if(v>hi)hi=v}
    return lo>=-40?1:hi<=40?-1:0;
  }));
  const groups=stones.map(()=>[]);
  for(const t of cutSurface(s.stone.pos,s.stone.tris,plates)){
    const m=[0,1,2].map(k=>(t[0][k]+t[1][k]+t[2][k])/3);
    groups[partOf(m,plates,sides,stones)].push(t);
  }
  drawn.parts=groups.map((g,i)=>({...trisBuffer(g),i}));
}
const SAW_BAND=28;
function uploadPlan(s){
  if(onlyStone!==null&&onlyStone>=activeStones(s).length)showOnly(null);
  if(onlyStone!==null||polishView||insideColors)uploadInclusions(s);
  uploadSaw(s);
  drawn.plan.forEach(p=>{gl.deleteBuffer(p.buf);gl.deleteBuffer(p.lines)});
  drawn.plan=activeStones(s).map(r=>{
    const m=bake([r.mesh]),buf=gl.createBuffer(),lines=gl.createBuffer(),L=new Float32Array(r.mesh.edges.length*6);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,m.data,gl.STATIC_DRAW);
    r.mesh.edges.forEach((v,i)=>{for(let k=0;k<3;k++)L[i*6+k]=r.mesh.pos[v*3+k];L[i*6+5]=1});
    gl.bindBuffer(gl.ARRAY_BUFFER,lines);gl.bufferData(gl.ARRAY_BUFFER,L,gl.STATIC_DRAW);
    return{buf,n:m.count,lines,ln:r.mesh.edges.length};
  });
}
// The flat faces of a polished stone, as planes with the stone on the inner side.
function stonePlanes(mesh){
  const p=mesh.pos,t=mesh.tris,mid=[0,0,0],out=[],seen=new Set(),n=p.length/3;
  for(let i=0;i<n;i++)for(let k=0;k<3;k++)mid[k]+=p[i*3+k]/n;
  for(let i=0;i<t.length;i+=3){
    const a=[0,1,2].map(k=>p[t[i]*3+k]),b=[0,1,2].map(k=>p[t[i+1]*3+k]-a[k]),c=[0,1,2].map(k=>p[t[i+2]*3+k]-a[k]),x=cross(b,c);
    if(Math.hypot(...x)<1e-9)continue;
    let f=unit(x),d=f[0]*a[0]+f[1]*a[1]+f[2]*a[2];
    if(f[0]*mid[0]+f[1]*mid[1]+f[2]*mid[2]>d){f=f.map(e=>-e);d=-d}
    const key=[...f.map(e=>e.toFixed(4)),d.toFixed(1)].join();
    if(!seen.has(key)){seen.add(key);out.push([...f,d])}
  }
  return out;
}
// Cuts an inclusion down to the part inside a stone. Returns null when none of it is inside.
function partInside(inc,planes){
  const p=inc.mesh.pos,t=inc.mesh.tris,pts=[],tris=[];
  for(let i=0;i<t.length;i+=3){
    let poly=[0,1,2].map(j=>[p[t[i+j]*3],p[t[i+j]*3+1],p[t[i+j]*3+2]]);
    for(const f of planes){
      const g=poly.map(q=>q[0]*f[0]+q[1]*f[1]+q[2]*f[2]-f[3]);
      if(g.every(x=>x<=0))continue;
      const next=[];
      poly.forEach((q,k)=>{
        const e=(k+1)%poly.length;
        if(g[k]<=0)next.push(q);
        if(g[k]*g[e]<0){const r=g[k]/(g[k]-g[e]);next.push(q.map((c,m)=>c+(poly[e][m]-c)*r))}
      });
      poly=next;
      if(poly.length<3)break;
    }
    if(poly.length<3)continue;
    const base=pts.length/3;
    poly.forEach(q=>pts.push(...q));
    for(let k=1;k<poly.length-1;k++)tris.push(base,base+k,base+k+1);
  }
  return tris.length?{pos:Float32Array.from(pts),tris}:null;
}
function uploadInclusions(s){
  drawn.inc.forEach(p=>gl.deleteBuffer(p.buf));
  drawn.inc=[];
  const only=onlyStone!==null?[activeStones(s)[onlyStone]]:polishView?activeStones(s):null;
  insideOnly=only?new Map():null;
  if(only)for(const r of only){
    const planes=stonePlanes(r.mesh);
    for(const i of s.inclusions){if(insideOnly.has(i))continue;const part=partInside(i,planes);if(part)insideOnly.set(i,part)}
  }
  // Inside / outside: an inclusion with any part inside a polished stone is purple, the rest orange.
  // Ignored ones keep their own buffer so the Ignored box still hides them.
  let inStone=null;
  if(insideColors){
    const planes=activeStones(s).map(r=>stonePlanes(r.mesh));
    inStone=new Set(s.inclusions.filter(i=>only?insideOnly.has(i):planes.some(p=>partInside(i,p))));
  }
  for(const state of Object.keys(INC_COLORS).filter(k=>!['inside','outside'].includes(k)))for(const place of insideColors?['inside','outside']:[null]){
    const list=s.inclusions.filter(i=>incGroup(i)===state&&(!only||insideOnly.has(i))&&(!place||inStone.has(i)===(place==='inside')));
    const b=bake(list.map(i=>only?insideOnly.get(i):i.mesh));
    if(!b.count)continue;
    const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,b.data,gl.STATIC_DRAW);
    drawn.inc.push({buf,n:b.count,state,color:place||state});
  }
  uploadOutside(s,only);
  const ib=$('insideView');ib.setAttribute('aria-pressed',insideColors);
  if(insideColors&&inStone)$('fitInfo').textContent=`Inside / outside: ${new Set([...inStone].map(i=>i.id)).size} inclusions reach inside the polished stones (purple), the others are orange.`;
  renderPolishBar(s);
}
// Where a polished stone comes out of the rough, the rough's surface runs through the stone. That surface, cut to the
// stone, is drawn as a black net over the polished stones, as Advisor hatches it; the depth is how far the stone is out.
function uploadOutside(s,only){
  if(drawn.outside){gl.deleteBuffer(drawn.outside);drawn.outside=null;drawn.outsideN=0}
  if(drawn.outsideFill){gl.deleteBuffer(drawn.outsideFill);drawn.outsideFill=null;drawn.outsideFillN=0}
  if(drawn.near){gl.deleteBuffer(drawn.near);drawn.near=null;drawn.nearN=0}
  if(!only||!s.stone)return;
  const L=[],notes=[],fills=[],N=[],gaps=[];
  only.forEach(r=>{
    const planes=stonePlanes(r.mesh),part=partInside({mesh:s.stone},planes),deep=outsideDepth(s,r);
    if(part){
      const P=part.pos,T=part.tris;
      fills.push(part);
      for(let i=0;i<T.length;i+=3)for(let j=0;j<3;j++){const a=T[i+j]*3,b=T[i+(j+1)%3]*3;L.push(P[a],P[a+1],P[a+2],0,0,1,P[b],P[b+1],P[b+2],0,0,1)}
    }
    // Girdle corners outside the rough get a small black star (they are not on any facet, so no net shows them).
    const inside=roughInside(s.stone);
    for(const q of girdleCorners(r))if(!inside(...q.p)){const m=Math.max(15,r.D*.02);for(const d of [[1,0,0],[0,1,0],[0,0,1]])L.push(q.p[0]-m*d[0],q.p[1]-m*d[1],q.p[2]-m*d[2],0,0,1,q.p[0]+m*d[0],q.p[1]+m*d[1],q.p[2]+m*d[2],0,0,1)}
    // Places within NEAR_UM of the rough get an orange cross, to compare with where Advisor hatches.
    const k=activeStones(s).indexOf(r),near=nearPoints(s,r);
    for(const q of near){const m=Math.max(10,r.D*.012);for(const d of [[1,0,0],[0,1,0],[0,0,1]])N.push(q.p[0]-m*d[0],q.p[1]-m*d[1],q.p[2]-m*d[2],0,0,1,q.p[0]+m*d[0],q.p[1]+m*d[1],q.p[2]+m*d[2],0,0,1)}
    if(!deep)gaps.push(`${k>=0?String.fromCharCode(65+k):''} closest ${near.length?Math.min(...near.map(q=>q.gap)):'over '+NEAR_UM} um`);
    if(!deep)return;
    notes.push(`${k>=0?String.fromCharCode(65+k):''} ${(r.D/1000).toFixed(3)} mm out by up to ${deep.toFixed(0)} um`);
  });
  if(L.length){
    drawn.outside=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,drawn.outside);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(L),gl.STATIC_DRAW);drawn.outsideN=L.length/6;
    const f=bake(fills);drawn.outsideFill=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,drawn.outsideFill);gl.bufferData(gl.ARRAY_BUFFER,f.data,gl.STATIC_DRAW);drawn.outsideFillN=f.count;
  }
  if(N.length){drawn.near=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,drawn.near);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(N),gl.STATIC_DRAW);drawn.nearN=N.length/6}
  if(polishView||onlyStone!==null)$('fitInfo').textContent=(notes.length?`Outside the rough (black net): ${notes.join('; ')}. `:'Every polished stone shown is inside the rough. ')+(gaps.length?`Orange crosses: within ${NEAR_UM} um of the rough (${gaps.join('; ')}).`:'');
}
// Advisor's 16 girdle corners of a stone (see facetCorners) in the rough's frame, each with its outward direction.
function girdleCorners(r){
  const [a0,b0,c0]=r.angles,[ca,sa,cb,sb,cc,sc]=[Math.cos(a0),Math.sin(a0),Math.cos(b0),Math.sin(b0),Math.cos(c0),Math.sin(c0)];
  const ex=[ca*cc-sa*cb*sc,ca*sc+sa*cb*cc,sa*sb],ey=[-sa*cc-ca*cb*sc,-sa*sc+ca*cb*cc,ca*sb],ez=[sc*sb,-cc*sb,cb],out=[];
  for(let i=0;i<16;i++)for(const z of [0,r.prop.girdle*r.D]){
    const az=i*Math.PI/8,R=r.D/2*GIRDLE_REACH,f=[0,1,2].map(k=>Math.cos(az)*ex[k]+Math.sin(az)*ey[k]);
    out.push({p:[0,1,2].map(k=>r.center[k]+R*f[k]+z*ez[k]),f});
  }
  return out;
}
// Places on a stone (facet points and girdle corners) within NEAR_UM of the rough, with their gap, one per 60 um patch.
const NEAR_UM=15;
function nearPoints(s,r,k=8){
  const inside=roughInside(s.stone),M=r.mesh,P=M.pos,T=M.tris,mid=[0,0,0],n=P.length/3,pts=[];
  for(let i=0;i<n;i++)for(let j=0;j<3;j++)mid[j]+=P[i*3+j]/n;
  for(let t=0;t<T.length;t+=3){
    const v=[0,1,2].map(j=>[0,1,2].map(q=>P[T[t+j]*3+q])),a=v[1].map((e,q)=>e-v[0][q]),b=v[2].map((e,q)=>e-v[0][q]);
    let f=cross(a,b);if(Math.hypot(...f)<1e-9)continue;f=unit(f);
    if(f[0]*(mid[0]-v[0][0])+f[1]*(mid[1]-v[0][1])+f[2]*(mid[2]-v[0][2])>0)f=f.map(e=>-e);
    for(let i=0;i<=k;i++)for(let j=0;j<=k-i;j++)pts.push({p:v[0].map((e,q)=>e+i/k*a[q]+j/k*b[q]),f});
  }
  pts.push(...girdleCorners(r));
  const out=[];
  for(const q of pts){
    if(!inside(...q.p))continue;
    let gap=NEAR_UM+1;for(let d=1;d<=NEAR_UM;d++)if(!inside(q.p[0]+d*q.f[0],q.p[1]+d*q.f[1],q.p[2]+d*q.f[2])){gap=d-1;break}
    if(gap>NEAR_UM)continue;
    const close=out.find(o=>Math.hypot(o.p[0]-q.p[0],o.p[1]-q.p[1],o.p[2]-q.p[2])<60);
    if(close){if(gap<close.gap)Object.assign(close,{p:q.p,gap})}else out.push({p:q.p,gap});
  }
  return out;
}
// How far a stone comes out of the rough: points over every facet are moved inward until all are inside (to 1 um).
function outsideDepth(s,r,k=8){
  const inside=roughInside(s.stone),M=r.mesh,P=M.pos,T=M.tris,mid=[0,0,0],n=P.length/3,pts=[];
  for(let i=0;i<n;i++)for(let j=0;j<3;j++)mid[j]+=P[i*3+j]/n;
  for(let t=0;t<T.length;t+=3){
    const v=[0,1,2].map(j=>[0,1,2].map(q=>P[T[t+j]*3+q])),a=v[1].map((e,q)=>e-v[0][q]),b=v[2].map((e,q)=>e-v[0][q]);
    let f=cross(a,b);if(Math.hypot(...f)<1e-9)continue;f=unit(f);
    if(f[0]*(mid[0]-v[0][0])+f[1]*(mid[1]-v[0][1])+f[2]*(mid[2]-v[0][2])>0)f=f.map(e=>-e);
    for(let i=0;i<=k;i++)for(let j=0;j<=k-i;j++)pts.push(v[0].map((e,q)=>e+i/k*a[q]+j/k*b[q]),f);
  }
  // The girdle corners Advisor's girdle reaches (see facetCorners), moved inward towards the stone's axis.
  for(const q of girdleCorners(r))pts.push(q.p,q.f);
  const ok=d=>{for(let i=0;i<pts.length;i+=2){const x=pts[i],f=pts[i+1];if(!inside(x[0]-d*f[0],x[1]-d*f[1],x[2]-d*f[2]))return false}return true};
  if(ok(0))return 0;
  let lo=0,hi=1;while(!ok(hi)&&hi<512)hi*=2;
  while(hi-lo>1){const m=(lo+hi)>>1;if(ok(m))hi=m;else lo=m}
  return hi;
}
// Each stone's part (the rough on its side of every saw that cuts its piece), its weight, and the stone's tilt: the
// angle between its axis (towards the culet) and the saw's normal pointing to its side, or the rough's z axis.
function stoneParts(s){
  const list=activeStones(s),plan=planFor(s),width=plan.sawWidth,saws=list.length>1?plan.saws:[];
  return list.map(r=>{
    const cuts=[],b=r.angles[1],c0=r.angles[2],axis=[Math.sin(b)*Math.sin(c0),-Math.sin(b)*Math.cos(c0),Math.cos(b)];
    let towards=[0,0,1];
    saws.forEach(c=>{
      const on=q=>q[0]*r.center[0]+q[1]*r.center[1]+q[2]*r.center[2]>=q[3];
      if(!(c.within||[]).every(on))return;
      const n=c.normal,side=n[0]*r.center[0]+n[1]*r.center[1]+n[2]*r.center[2]>=c.offset?1:-1;
      cuts.push([n[0]*side,n[1]*side,n[2]*side,side*c.offset+width/2]);towards=n.map(e=>e*side);
    });
    const part=roughWeight(s,cuts),tilt=deg(Math.acos(Math.max(-1,Math.min(1,axis[0]*towards[0]+axis[1]*towards[1]+axis[2]*towards[2]))));
    // Sizes of the part and of the whole rough across and along the stone's axis, from the rough's corners.
    const [ca,sa,cb,sb,cc,sc]=[Math.cos(r.angles[0]),Math.sin(r.angles[0]),Math.cos(b),Math.sin(b),Math.cos(c0),Math.sin(c0)];
    const ex=[ca*cc-sa*cb*sc,ca*sc+sa*cb*cc,sa*sb],ey=[-sa*cc-ca*cb*sc,-sa*sc+ca*cb*cc,ca*sb];
    const box=pts=>{const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(const q of pts){const v=[ex,ey,axis].map(e=>e[0]*q[0]+e[1]*q[1]+e[2]*q[2]);v.forEach((x,k)=>{lo[k]=Math.min(lo[k],x);hi[k]=Math.max(hi[k],x)})}const d=hi.map((h,k)=>(h-lo[k])/1000),[L,W]=[d[0],d[1]].sort((p,q)=>q-p);return{L,W,H:d[2]}};
    const P=s.stone.pos,all=[],inPart=[];
    for(let i=0;i<P.length;i+=3){const q=[P[i],P[i+1],P[i+2]];all.push(q);if(cuts.every(([x,y,z,d])=>x*q[0]+y*q[1]+z*q[2]>=d))inPart.push(q)}
    return{part,tilt,partBox:inPart.length?box(inPart):null,roughBox:box(all)};
  });
}
// Advisor's left panel, under the 3D view: one table per stone in its colour, then the rough and totals.
function renderAdvPanel(s){
  const box=$('advPanel'),show=s&&!s.error&&s.stone&&activeStones(s).length;
  box.hidden=!show;if(!show){box.innerHTML='';return}
  const list=activeStones(s),parts=stoneParts(s),plan=planFor(s),rates=profitSettings(),hex=c=>'#'+c.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
  let polish=0,profit=0;
  const tables=list.map((r,i)=>{
    const v=stoneRows(r),D=v.dia,mm=x=>(x/100*D).toFixed(2),ct=stoneWeight(r),pt=parts[i],col=hex(PLAN_COLORS[i%3]),out=outsideDepth(s,r);
    polish+=ct;profit+=stoneMoney(r.D,ct,rates).profit;
    const dims=b=>b?`L:${b.L.toFixed(2)} W:${b.W.toFixed(2)} H:${b.H.toFixed(2)}`:'—';
    return`<div><div class="head" style="color:${col}">${String.fromCharCode(65+i)}: ${ct.toFixed(3)}ct (${pt.part.toFixed(3)}ct) ${pt.part?(ct/pt.part*100).toFixed(2):'—'}% · ${charniFor(D)}${out?` · <span style="color:#000">out ${out} µm</span>`:''}</div>
    <table><tr><th style="background:${col}">L:W</th><th style="background:${col}">W:${D.toFixed(2)}</th><th style="background:${col}">L:${D.toFixed(2)}</th></tr>
    <tr><td>Height</td><td>${v.total.toFixed(1)}%</td><td>${mm(v.total)}mm</td></tr>
    <tr><td>Table</td><td>${v.table.toFixed(1)}%</td><td>${mm(v.table)}mm</td></tr>
    <tr><td>Crown°</td><td>${v.crownAngle.toFixed(2)}°</td><td></td></tr>
    <tr><td>Crown H</td><td>${v.crown.toFixed(1)}%</td><td>${mm(v.crown)}mm</td></tr>
    <tr><td>Girdle</td><td>${v.girdle.toFixed(1)}%</td><td>${mm(v.girdle)}mm</td></tr>
    <tr><td>Pavil.°</td><td>${v.pavAngle.toFixed(2)}°</td><td></td></tr>
    <tr><td>Pavil.H</td><td>${v.pavilion.toFixed(1)}%</td><td>${mm(v.pavilion)}mm</td></tr>
    <tr><td>L/W</td><td>1.00</td><td></td></tr>
    <tr><td>Tilt</td><td>${pt.tilt.toFixed(0)}°</td><td></td></tr>
    <tr><td>Star/Half</td><td>${v.star.toFixed(1)}%</td><td>${v.half.toFixed(1)}%</td></tr>
    <tr><td>Culet</td><td>0.00mm</td><td>0.0%</td></tr>
    <tr><td>Rough</td><td colspan="2">${dims(pt.partBox)}</td></tr>
    <tr><td></td><td colspan="2">${dims(pt.roughBox)}</td></tr></table></div>`;
  });
  const saw=list.length>1?`${plan.sawWidth}µm`:'None';
  tables.splice(1,0,`<div><table><tr><td>Rough</td><td>${s.rough.toFixed(3)}ct</td></tr><tr><td>Saw width</td><td>${saw}</td></tr><tr><td>FL</td><td>None</td></tr>
    <tr><td>T Polish</td><td>${polish.toFixed(3)}ct (${s.rough?(polish/s.rough*100).toFixed(2):'—'}%)</td></tr><tr><td>Profit</td><td>${rupees(profit)}</td></tr><tr><td>Rough cost</td><td>${rupees(roughCost(s))}</td></tr><tr><td>Net profit</td><td>${rupees(profit-roughCost(s))}</td></tr></table></div>`);
  box.innerHTML=tables.join('');
}
// Advisor's Inclusion Projection: the stone seen straight down its axis from the pavilion side, as an outline with its
// facet lines, and the inclusions inside it.
function aimProjection(s){
  const r=activeStones(s)[onlyStone??0];if(!r)return;
  const b=r.angles[1],c0=r.angles[2],axis=[Math.sin(b)*Math.sin(c0),-Math.sin(b)*Math.cos(c0),Math.cos(b)];
  const u=unit(cross(axis,Math.abs(axis[0])<.9?[1,0,0]:[0,1,0])),v=cross(axis,u);
  cam.M=[u,v,axis];
  const bb=bbox(r.mesh);cam.center=bb.lo.map((x,k)=>(x+bb.hi[k])/2);cam.panX=cam.panY=0;
}
// Polish view: only the polished stones. Tab shows the inclusions inside them, and a letter picks one stone.
function renderPolishBar(s){
  const b=$('polishView'),box=$('polishStones');
  b.setAttribute('aria-pressed',polishView);
  b.textContent=polishView?'Show rough':'Polish';
  const list=polishView&&s?activeStones(s):[];
  renderAdvPanel(s);
  box.hidden=!list.length;
  box.innerHTML=!list.length?'':[...(list.length<2?[]:[`<button data-polish="all" aria-pressed="${onlyStone===null}">All</button>`,...list.map((r,i)=>`<button data-polish="${i}" aria-pressed="${onlyStone===i}">${String.fromCharCode(65+i)}</button>`)]),
    `<button data-polish="proj" aria-pressed="${projView}" title="Look straight down the stone's axis from the pavilion, as Advisor's Inclusion Projection">Projection</button>`].join('');
}
// Turns the view so a saw is seen edge on, as one straight line. Each press moves to the next saw.
let sawViewAt=-1;
function lookAlongSaw(){
  const s=stones[current];
  const list=s?(s.ownPlan?s.ownSaws:s.fileSaws)||[]:[];
  if(!list.length){$('fitInfo').textContent='This plan has no saw.';return}
  sawViewAt=(sawViewAt+1)%list.length;
  const n=list[sawViewAt].normal,label=`Saw ${sawViewAt+1} of ${list.length}`;
  if(scanMode&&s.frames?.length){
    let best=0,off=Infinity;
    s.frames.forEach((f,i)=>{
      const v=scanMap(s,f,gl.canvas.width,gl.canvas.height)?.M[2];
      if(!v)return;
      const d=Math.abs(v[0]*n[0]+v[1]*n[1]+v[2]*n[2]);
      if(d<off){off=d;best=i}
    });
    goToFrame(best,1);
    $('fitInfo').textContent=`${label}: scan frame ${best+1}, ${(Math.asin(Math.min(1,off))*180/Math.PI).toFixed(0)}° from edge on. The scanner only turns one way, so the 3D model shows it exactly.`;
    return;
  }
  const seed=Math.abs(n[2])<.9?[0,0,1]:[1,0,0],v=unit(cross(n,seed)),u=unit(cross(v,n));
  cam.M=[[...n],u,cross(n,u)];
  render();queueInset();
  $('fitInfo').textContent=`${label}, seen edge on.`;
}
function togglePolish(){
  const s=stones[current];
  if(onlyStone!==null)showOnly(null);
  polishView=!polishView;projView=false;
  if(polishView){polishInc=$('showInc').checked;$('showInc').checked=false}
  else $('showInc').checked=polishInc;
  if(s)uploadInclusions(s);
  render();queueInset();
}
function upload(s){
  if(!gl)return;
  if(drawn.stone)gl.deleteBuffer(drawn.stone);
  drawn.inc.forEach(p=>gl.deleteBuffer(p.buf));
  drawn.plan.forEach(p=>{gl.deleteBuffer(p.buf);gl.deleteBuffer(p.lines)});
  if(drawn.saw)gl.deleteBuffer(drawn.saw);
  drawn={stone:null,inc:[],stoneN:0,plan:[],saw:null,sawN:0,outside:null,outsideN:0,near:null,nearN:0};
  if(!s.stone)return;
  const a=bake([s.stone]);
  drawn.stone=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,drawn.stone);gl.bufferData(gl.ARRAY_BUFFER,a.data,gl.STATIC_DRAW);drawn.stoneN=a.count;
  uploadInclusions(s);
  uploadPlan(s);
  const bb=bbox(s.stone);
  cam.center=bb.lo.map((v,i)=>(v+bb.hi[i])/2);
  cam.scale=1/(Math.hypot(...bb.hi.map((h,i)=>h-bb.lo[i]))*.55);
  cam.zoom=1;cam.panX=cam.panY=0;
  if(rotMode==='horizontal')uprightView();else defaultView(s);
}
function rotation(){
  const m=cam.M;
  return new Float32Array([m[0][0],m[1][0],m[2][0],m[0][1],m[1][1],m[2][1],m[0][2],m[1][2],m[2][2]]);
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
// Opening view: the saw plane runs diagonally across the screen, as in Advisor's plan view.
function defaultView(s,turn=VIEW_TURN){
  const n=s.sawNormal;
  if(!n){cam.M=[[1,0,0],[0,0,-1],[0,1,0]];return}
  const a=unit(cross(n,Math.abs(n[0])<.9?[1,0,0]:[0,1,0])),b=cross(n,a);
  const ez=a.map((v,i)=>Math.cos(turn)*v+Math.sin(turn)*b[i]),f=cross(n,ez);
  cam.M=[n.map((v,i)=>.65*v-.76*f[i]),n.map((v,i)=>.76*v+.65*f[i]),ez];
}
// The scan turns the stone about its z axis, so that axis stays upright in this mode.
function setScanView(s,th){
  cam.scanAngle=th;
  const R=s.pose.R,A=R[1].map(v=>-v),B=R[0],c=Math.cos(th),n=Math.sin(th);
  cam.M=[A.map((v,i)=>c*v+n*B[i]),R[2],A.map((v,i)=>-n*v+c*B[i])];
}
function uprightView(){
  const s=stones[current];
  if(s&&s.pose)setScanView(s,frameAt*2*Math.PI/300);else cam.M=[[1,0,0],[0,0,-1],[0,1,0]];
}
function setRotation(mode){
  rotMode=mode;
  $('rot360').setAttribute('aria-pressed',mode==='free');
  $('rotH').setAttribute('aria-pressed',mode==='horizontal');
  if(mode==='horizontal')uprightView();
  else{if(scanMode)setScan(false);if(current>=0)defaultView(stones[current])}
  render();
}
// Image links are made on first use and dropped when the stone changes.
function imageUrl(s,im){
  if(!im.url){im.url=URL.createObjectURL(s.file.slice(im.s,im.e,'image/jpeg'));openUrls.push(im)}
  return im.url;
}
function releaseUrls(){
  for(const im of openUrls){URL.revokeObjectURL(im.url);im.url=null}
  openUrls=[];
}
// Decoded photos, kept so a drag can draw them at once. Oldest ones are dropped first.
const KEEP_PHOTOS=48,LOOK_AHEAD=16;
const photos=new Map();
function framePhoto(s,f){
  let p=photos.get(f);
  if(p)photos.delete(f);
  else p=createImageBitmap(s.file.slice(f.s,f.e,'image/jpeg')).catch(()=>null);
  photos.set(f,p);
  if(photos.size>KEEP_PHOTOS){
    const [old,oldPhoto]=photos.entries().next().value;
    photos.delete(old);oldPhoto.then(b=>b&&b.close());
  }
  return p;
}
function releasePhotos(){
  for(const p of photos.values())p.then(b=>b&&b.close());
  photos.clear();
}
async function lookAhead(s,dir){
  const ticket=++aheadTicket,n=s.frames.length,from=frameAt;
  for(let k=1;k<=LOOK_AHEAD;k++){
    if(ticket!==aheadTicket||stones[current]!==s)return;
    const f=s.frames[(from+dir*k+n*2)%n];
    if(!await checkFrame(s,f))await framePhoto(s,f);
  }
}
async function showFrame(dir=1){
  const s=stones[current],n=s?s.frames.length:0;
  if(!n){$('dim').textContent='No scan frames in this file';return}
  const ticket=++frameTicket;
  frameAt=(frameAt%n+n)%n;
  for(let tries=0;tries<n;tries++){
    const bad=await checkFrame(s,s.frames[frameAt]);
    if(ticket!==frameTicket)return;
    if(!bad)break;
    frameAt=(frameAt+dir+n)%n;
  }
  const f=s.frames[frameAt];
  if(scanMode){
    const photo=await framePhoto(s,f);
    if(ticket!==frameTicket)return;
    if(photo)shownPhoto=photo;
    showScanNote(n);
    lookAhead(s,dir);
  }else $('inset').querySelector('img').src=imageUrl(s,f);
  if(rotMode==='horizontal'&&s.pose)setScanView(s,f.index*2*Math.PI/300);
  render();
  queueInset();
}
// During a drag only the newest position matters, so steps that arrive meanwhile are skipped.
function goToFrame(i,dir){
  frameGoal=i;frameGoalDir=dir;
  if(frameBusy)return;
  frameBusy=true;
  requestAnimationFrame(runFrameGoal);
}
async function runFrameGoal(){
  const goal=frameGoal;
  frameGoal=null;
  if(goal!==null){frameAt=goal;await showFrame(frameGoalDir)}
  if(frameGoal!==null)requestAnimationFrame(runFrameGoal);
  else frameBusy=false;
}
function showScanNote(n){
  $('dim').textContent=`Scan frame ${frameAt+1} of ${n}`+(stones[current]?.pose?'':' · this file has no stored scanner position');
}
function setScan(on){
  scanMode=on;
  $('scan').classList.toggle('on',on);
  $('stage').classList.toggle('scan',on);
  $('inset').className=on?'model':'scan';
  if(on)showFrame();else if(current>=0)showDim(stones[current]);
  render();
}
