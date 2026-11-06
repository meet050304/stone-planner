// The planner's search. It runs in background workers: fitterUrl() in plan.js starts each worker from this
// function's own text, which works when the page is opened straight from a folder.
function fitterCode(){
// Runs in a background worker: fits the largest round stones into the rough, keeping selected
// inclusions outside every stone unless they are small enough to stay inside. Stones share the rough through flat saw cuts.
const VOXEL=30,MIN_D=500,MAX_D=4000,AZ=36,COS_22=Math.cos(Math.PI/8);
let SAW=25,SAFETY=0,ROUGH_SAFETY=0,PROFIT=null,sizes,TABLE_BLOCK=0,CULET_BLOCK=0,TABLE_T=.5,CULET_T=.6,BOTTOM_T=.9;
let CUTS=[];
const cosA=new Float64Array(AZ),sinA=new Float64Array(AZ);
for(let i=0;i<AZ;i++){cosA[i]=Math.cos(i*2*Math.PI/AZ);sinA[i]=Math.sin(i*2*Math.PI/AZ)}
let seed=12345;
function rnd(){seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}
function gauss(){return Math.sqrt(-2*Math.log(1-rnd()))*Math.cos(2*Math.PI*rnd())}
let lo,nx,ny,nz,mask,points;
function buildMask(verts,tris){
  lo=[1e9,1e9,1e9];const hi=[-1e9,-1e9,-1e9];
  for(const v of tris)for(let k=0;k<3;k++){const c=verts[v*3+k];if(c<lo[k])lo[k]=c;if(c>hi[k])hi[k]=c}
  for(let k=0;k<3;k++){lo[k]-=VOXEL;hi[k]+=VOXEL}
  nx=Math.ceil((hi[0]-lo[0])/VOXEL);ny=Math.ceil((hi[1]-lo[1])/VOXEL);nz=Math.ceil((hi[2]-lo[2])/VOXEL);
  mask=new Uint8Array(nx*ny*nz);
  const hits=new Map();
  for(let i=0;i<tris.length;i+=3){
    const q=[0,1,2].map(j=>{const v=tris[i+j]*3;return[(verts[v]-lo[0])/VOXEL,(verts[v+1]-lo[1])/VOXEL,(verts[v+2]-lo[2])/VOXEL]});
    const [a,b,c]=q,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(d)<1e-12)continue;
    const x0=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])-.5)),x1=Math.min(nx-1,Math.floor(Math.max(a[0],b[0],c[0])-.5));
    const y0=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])-.5)),y1=Math.min(ny-1,Math.floor(Math.max(a[1],b[1],c[1])-.5));
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const px=x+.5,py=y+.5,w0=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/d,w1=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/d,w2=1-w0-w1;
      if(w0<0||w1<0||w2<0)continue;
      const key=x*ny+y;let list=hits.get(key);if(!list)hits.set(key,list=[]);
      list.push(w0*a[2]+w1*b[2]+w2*c[2]);
    }
  }
  for(const [key,zs] of hits){
    zs.sort((p,q)=>p-q);
    const x=Math.floor(key/ny),y=key%ny;
    for(let i=0;i+1<zs.length;i+=2)for(let z=Math.max(0,zs[i]|0);z<=Math.min(nz-1,zs[i+1]|0);z++)mask[(x*ny+y)*nz+z]=1;
  }
  // The mask counts a cube as inside when the surface only passes through it, so it can be up to a cube too generous.
  // For the fit check each cube is marked deep inside (it and all 26 neighbours in the mask), deep outside (none of them),
  // or on the surface, where a point is tested exactly against the rough's triangles.
  depth=new Uint8Array(nx*ny*nz);
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++){
    let any=0,all=1;
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++){
      const X=x+i,Y=y+j,Z=z+k,m=X>=0&&Y>=0&&Z>=0&&X<nx&&Y<ny&&Z<nz?mask[(X*ny+Y)*nz+Z]:0;
      if(m)any=1;else all=0;
    }
    depth[(x*ny+y)*nz+z]=all?2:any?1:0;
  }
  roughV=verts;roughT=tris;
  const B=ROUGH_BIN,bx=Math.ceil((hi[0]-lo[0])/B)+1,by=Math.ceil((hi[1]-lo[1])/B)+1,bins=Array.from({length:bx*by},()=>[]);
  for(let i=0;i<tris.length;i+=3){
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for(let j=0;j<3;j++){const v=tris[i+j]*3;x0=Math.min(x0,verts[v]);x1=Math.max(x1,verts[v]);y0=Math.min(y0,verts[v+1]);y1=Math.max(y1,verts[v+1])}
    for(let X=Math.floor((x0-lo[0])/B);X<=Math.floor((x1-lo[0])/B);X++)for(let Y=Math.floor((y0-lo[1])/B);Y<=Math.floor((y1-lo[1])/B);Y++)bins[X*by+Y].push(i);
  }
  roughBins={bins,bx,by};
}
let depth,roughV,roughT,roughBins;
const ROUGH_BIN=60;
// Exactly inside the rough: count the rough's surface crossings on a line straight up from the point.
function insideExact(x,y,z){
  const i=Math.floor((x-lo[0])/VOXEL),j=Math.floor((y-lo[1])/VOXEL),k=Math.floor((z-lo[2])/VOXEL);
  if(i<0||j<0||k<0||i>=nx||j>=ny||k>=nz)return false;
  const d=depth[(i*ny+j)*nz+k];
  if(d!==1)return d===2;
  const {bins,bx,by}=roughBins,X=Math.floor((x-lo[0])/ROUGH_BIN),Y=Math.floor((y-lo[1])/ROUGH_BIN);
  if(X<0||Y<0||X>=bx||Y>=by)return false;
  let n=0;
  for(const t of bins[X*by+Y]){
    const A=roughT[t]*3,B=roughT[t+1]*3,C=roughT[t+2]*3,ax=roughV[A],ay=roughV[A+1],bx2=roughV[B],by2=roughV[B+1],cx=roughV[C],cy=roughV[C+1];
    const det=(by2-cy)*(ax-cx)+(cx-bx2)*(ay-cy);
    if(Math.abs(det)<1e-12)continue;
    const w0=((by2-cy)*(x-cx)+(cx-bx2)*(y-cy))/det,w1=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det,w2=1-w0-w1;
    if(w0<0||w1<0||w2<0)continue;
    if(w0*roughV[A+2]+w1*roughV[B+2]+w2*roughV[C+2]>z)n++;
  }
  return n%2===1;
}
function inside(x,y,z){
  const i=(x-lo[0])/VOXEL|0,j=(y-lo[1])/VOXEL|0,k=(z-lo[2])/VOXEL|0;
  return i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz&&mask[(i*ny+j)*nz+k]===1;
}
// The cone in fits() runs through the facet tips, so it is a little larger than the stone. A point it catches is
// checked against the real facets, turned the way the drawn stone is turned, less the safety distance.
let SPIN=0;
function inFacets(x,y,z,a,p,D){
  const f=p.planes;
  if(!f)return true;
  const cb=a[2],sb=Math.sqrt(Math.max(0,1-cb*cb)),t=Math.atan2(a[0],-a[1]),cc=Math.cos(t),sc=Math.sin(t),ca=Math.cos(SPIN),sa=Math.sin(SPIN);
  const x1=x*cc+y*sc,y1=-x*sc+y*cc,y0=y1*cb+z*sb,z0=-y1*sb+z*cb,lx=x1*ca+y0*sa,ly=-x1*sa+y0*ca,scale=D/1000;
  for(let i=0;i<f.length;i+=4)if(f[i]*lx+f[i+1]*ly+f[i+2]*z0>f[i+3]*scale-SAFETY)return false;
  return true;
}
function fits(c,a,D,p,cuts){
  const R=D/2,s=Math.abs(a[0])<.9?[1,0,0]:[0,1,0];
  let ux=a[1]*s[2]-a[2]*s[1],uy=a[2]*s[0]-a[0]*s[2],uz=a[0]*s[1]-a[1]*s[0];const l=Math.hypot(ux,uy,uz);ux/=l;uy/=l;uz/=l;
  const vx=a[1]*uz-a[2]*uy,vy=a[2]*ux-a[0]*uz,vz=a[0]*uy-a[1]*ux;
  const top=-p.crown*D,gird=p.girdle*D,cul=gird+p.pavilion*D;
  const tip=[c[0]+a[0]*cul,c[1]+a[1]*cul,c[2]+a[2]*cul];
  if(!insideExact(tip[0],tip[1],tip[2]))return false;
  for(const n of cuts)if(tip[0]*n[0]+tip[1]*n[1]+tip[2]*n[2]<n[3])return false;
  // The star and lower-half tips stick out past a straight cone, so the outline goes through them.
  const rt=p.table*R,rm=rt*COS_22,rs=rm+(R-rm)*p.star,zs=top*(R-rs*COS_22)/(R-rt),rl=R*(1-p.half),zl=gird+p.pavilion*D*(1-(1-p.half)*COS_22);
  const rows=[[rt,top],[(rt+rs)/2,(top+zs)/2],[rs,zs],[(rs+R)/2,zs/2],[R,0],[R,gird],[(R+rl)/2,(gird+zl)/2],[rl,zl],[rl/2,(zl+cul)/2]];
  for(const [r,z] of rows)for(let i=0;i<AZ;i++){
    const e=r*cosA[i],f=r*sinA[i],x=c[0]+z*a[0]+e*ux+f*vx,y=c[1]+z*a[1]+e*uy+f*vy,w=c[2]+z*a[2]+e*uz+f*vz;
    if(!insideExact(x,y,w))return false;
    for(const n of cuts)if(x*n[0]+y*n[1]+w*n[2]<n[3])return false;
  }
  // Every real facet corner of the stone must be inside the rough and on its side of every saw too.
  if(p.corners){
    const cb=a[2],sb=Math.sqrt(Math.max(0,1-cb*cb)),t=Math.atan2(a[0],-a[1]),cc=Math.cos(t),sc=Math.sin(t),ca=Math.cos(SPIN),sa=Math.sin(SPIN);
    const toL=(x,y,z)=>{const x1=x*cc+y*sc,y1=-x*sc+y*cc,y0=y1*cb+z*sb,z0=-y1*sb+z*cb;return[x1*ca+y0*sa,-x1*sa+y0*ca,z0]};
    const e0=toL(1,0,0),e1=toL(0,1,0),e2=toL(0,0,1),C=p.corners;
    for(let i=0;i<C.length;i+=3){
      const l0=C[i]*D,l1=C[i+1]*D,l2=C[i+2]*D;
      const x=c[0]+l0*e0[0]+l1*e0[1]+l2*e0[2],y=c[1]+l0*e1[0]+l1*e1[1]+l2*e1[2],w=c[2]+l0*e2[0]+l1*e2[1]+l2*e2[2];
      if(!insideExact(x,y,w))return false;
      for(const n of cuts)if(x*n[0]+y*n[1]+w*n[2]<n[3])return false;
    }
    // Every facet, not only its corners, stays the rough safety distance inside the rough: points over each facet
    // (corners, edge middles, middles) are moved that far out along the facet's outward direction and tested.
    if(ROUGH_SAFETY>0&&p.skin){
      const S=p.skin,m=ROUGH_SAFETY;
      for(let i=0;i<S.length;i+=6){
        const l0=S[i]*D,l1=S[i+1]*D,l2=S[i+2]*D,n0=S[i+3],n1=S[i+4],n2=S[i+5];
        const x=c[0]+l0*e0[0]+l1*e0[1]+l2*e0[2]+m*(n0*e0[0]+n1*e0[1]+n2*e0[2]);
        const y=c[1]+l0*e1[0]+l1*e1[1]+l2*e1[2]+m*(n0*e1[0]+n1*e1[1]+n2*e1[2]);
        const w=c[2]+l0*e2[0]+l1*e2[1]+l2*e2[2]+m*(n0*e2[0]+n1*e2[1]+n2*e2[2]);
        if(!insideExact(x,y,w))return false;
      }
    }
  }
  // Polishing removes the outer skin, so an inclusion only counts when deeper than the safety distance.
  const reach=Math.max(cul,R)*Math.max(cul,R)*2,up1=(R-rs)/-zs,up2=(rs-rt)/(zs-top),down1=(R-rl)/(zl-gird),down2=rl/(cul-zl);
  const in1=SAFETY*Math.hypot(1,up1),in2=SAFETY*Math.hypot(1,up2),in3=SAFETY*Math.hypot(1,down1),in4=SAFETY*Math.hypot(1,down2);
  // Only grid cells that can touch the stone's cylinder (axis from table to culet, radius R) are looked at:
  // every point that could lie inside the stone is still checked, so the answer is the same as checking all.
  const g=pointGrid(points),G=g.cell,h=G*.8661,e1=[0,1,2].map(k=>c[k]+a[k]*top),e2=[0,1,2].map(k=>c[k]+a[k]*cul);
  const from=[0,1,2].map(k=>Math.max(0,Math.floor((Math.min(e1[k],e2[k])-R-G-g.lo[k])/G))),to=[0,1,2].map(k=>Math.min(g.n[k]-1,Math.floor((Math.max(e1[k],e2[k])+R+G-g.lo[k])/G)));
  for(let ix=from[0];ix<=to[0];ix++)for(let iy=from[1];iy<=to[1];iy++)for(let iz=from[2];iz<=to[2];iz++){
    const cell=(ix*g.n[1]+iy)*g.n[2]+iz,s0=g.start[cell],s1=g.start[cell+1];
    if(s0===s1)continue;
    const qx=g.lo[0]+(ix+.5)*G-c[0],qy=g.lo[1]+(iy+.5)*G-c[1],qz=g.lo[2]+(iz+.5)*G-c[2],t=qx*a[0]+qy*a[1]+qz*a[2];
    if(t<top-h||t>cul+h||qx*qx+qy*qy+qz*qz-t*t>(R+h)*(R+h))continue;
    for(let j=s0;j<s1;j++){
    const i=g.order[j];
    const dx=points[i]-c[0],dy=points[i+1]-c[1],dz=points[i+2]-c[2],dd=dx*dx+dy*dy+dz*dz;
    if(dd>reach)continue;
    const z=dx*a[0]+dy*a[1]+dz*a[2];
    if(z<=top+SAFETY||z>=cul)continue;
    const limit=Math.min(R-SAFETY,R+up1*z-in1,rs+up2*(z-zs)-in2,R-down1*(z-gird)-in3,down2*(cul-z)-in4);
    // An Auto inclusion may stay inside the stone, but not under the table (crown and girdle) or near the culet.
    const across=dd-z*z,span=cul-top,zone=(TABLE_BLOCK&&across<=rt*rt&&z<=top+TABLE_T*span)||(CULET_BLOCK&&z>=top+CULET_T*span);
    const code=sizes[i/3];
    if(limit>0&&across<limit*limit&&(code>=1||(zone&&code!==.25)||(code>0&&z>=top+BOTTOM_T*span))&&inFacets(dx,dy,dz,a,p,D))return false;
    }
  }
  return true;
}
// Inclusion points sorted into cubes once per point list, so a check only visits cubes near the stone.
const GRID_CELL=120,grids=new WeakMap();
function pointGrid(pts){
  let g=grids.get(pts);
  if(g)return g;
  const n3=pts.length/3,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pts.length;i+=3)for(let k=0;k<3;k++){if(pts[i+k]<lo[k])lo[k]=pts[i+k];if(pts[i+k]>hi[k])hi[k]=pts[i+k]}
  if(!n3){lo.fill(0);hi.fill(0)}
  const n=[0,1,2].map(k=>Math.max(1,Math.floor((hi[k]-lo[k])/GRID_CELL)+1)),count=new Int32Array(n[0]*n[1]*n[2]+1),at=new Int32Array(n3);
  for(let i=0,j=0;i<pts.length;i+=3,j++){
    const ix=Math.floor((pts[i]-lo[0])/GRID_CELL),iy=Math.floor((pts[i+1]-lo[1])/GRID_CELL),iz=Math.floor((pts[i+2]-lo[2])/GRID_CELL);
    at[j]=(ix*n[1]+iy)*n[2]+iz;count[at[j]+1]++;
  }
  for(let k=1;k<count.length;k++)count[k]+=count[k-1];
  const start=Int32Array.from(count),fill=Int32Array.from(count),order=new Int32Array(n3);
  for(let j=0;j<n3;j++)order[fill[at[j]]++]=j*3;
  g={lo,n,cell:GRID_CELL,start,order};
  grids.set(pts,g);
  return g;
}
// Diagnostics only: counts and copies, never read by the search.
let DIAG={fits:0};
function largest(c,a,p,cuts){
  DIAG.fits++;
  if(!fits(c,a,MIN_D,p,cuts))return 0;
  let low=MIN_D,high=MAX_D;
  for(let i=0;i<10;i++){const m=(low+high)/2;if(fits(c,a,m,p,cuts))low=m;else high=m}
  return low;
}
const weight=s=>s.cut.k*(s.D/1000)**3;
// Profit of one polished stone. The price band follows the size after polishing loss.
function stoneProfit(D,ct){
  const keep=1-PROFIT.loss,price=D/1000*Math.cbrt(keep)<=PROFIT.limit?PROFIT.high:PROFIT.low;
  return ct*keep*price-PROFIT.labour;
}
const score=s=>PROFIT?stoneProfit(s.D,weight(s)):weight(s);
// A smaller stone at the same place always fits, so a stone can be held below the blocked sizes.
function sized(D,cut){
  if(!PROFIT)return D;
  const below=Math.round((PROFIT.blockFrom-.005)*1000)-1,above=Math.round((PROFIT.blockTo+.005)*1000);
  if(D<below)return D;
  if(D<above)return below;
  return score({D,cut})>score({D:below,cut})?D:below;
}
// Small moves and tilts of one stone, kept when it earns more.
function tuneStone(from,cuts,n){
  let cur=from;
  for(let i=0;i<n;i++){
    const shrink=1-i/n*.8,c=cur.center.map(e=>e+gauss()*40*shrink),raw=cur.axis.map(e=>e+gauss()*.06*shrink),l=Math.hypot(...raw),a=raw.map(e=>e/l),cut=rnd()<CUT_SWAP?CUTS[rnd()*CUTS.length|0]:cur.cut,full=largest(c,a,cut,cuts);
    if(!full)continue;
    const next={D:sized(full,cut),full,center:c,axis:a,cut};
    if(score(next)>score(cur))cur=next;
  }
  return cur;
}
const FINISH_TUNE=120,FINISH_CLIMB={climbCentre:30,climbAngle:2,climbSteps:300,centreMin:1,angleMin:.05},WEIGHT_SEARCH=true,CUT_SWAP=.35;
function maskCells(cuts){
  const cells=[];
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++){
    if(!mask[(x*ny+y)*nz+z])continue;
    const p=[lo[0]+(x+.5)*VOXEL,lo[1]+(y+.5)*VOXEL,lo[2]+(z+.5)*VOXEL];
    if(cuts.every(n=>p[0]*n[0]+p[1]*n[1]+p[2]*n[2]>=n[3]))cells.push(p);
  }
  return cells;
}
// A quick look keeps the best random fit with no fine tuning; it is for ranking saw planes.
function bestStone(tries,cuts,quick=false,from=null){
  const cells=from?from.filter(p=>{const n=cuts[cuts.length-1];return p[0]*n[0]+p[1]*n[1]+p[2]*n[2]>=n[3]}):maskCells(cuts);
  if(!cells.length)return null;
  const found=[];
  for(let t=0;t<tries;t++){
    const q=cells[rnd()*cells.length|0],c=[q[0]+(rnd()-.5)*VOXEL,q[1]+(rnd()-.5)*VOXEL,q[2]+(rnd()-.5)*VOXEL];
    const v=[gauss(),gauss(),gauss()],l=Math.hypot(...v),a=v.map(e=>e/l),cut=CUTS[rnd()*CUTS.length|0],full=largest(c,a,cut,cuts);
    if(full)found.push({D:sized(full,cut),full,center:c,axis:a,cut});
  }
  if(!found.length)return null;
  found.sort((p,q)=>score(q)-score(p));
  if(quick)return found[0];
  let best=found[0];
  for(const f of found.slice(0,6)){
    let cur=f;
    for(let i=0,n=Math.max(30,tries>>2);i<n;i++){
      const shrink=1-i/n*.8,c=cur.center.map(e=>e+gauss()*50*shrink),raw=cur.axis.map(e=>e+gauss()*.08*shrink),l=Math.hypot(...raw),a=raw.map(e=>e/l),full=largest(c,a,cur.cut,cuts);
      if(!full)continue;
      const next={D:sized(full,cur.cut),full,center:c,axis:a,cut:cur.cut},gain=score(next)-score(cur);
      if(gain>0||(gain===0&&full>cur.full))cur=next;
    }
    if(score(cur)>score(best))best=cur;
  }
  return best;
}
// Saw planes come from a fixed sweep of directions and positions. Each gets a quick look, and only the best get a full search.
function trySplit(region,tries){
  const c=region.stone.center,base=maskCells(region.cuts),quick=[];
  for(const n of SWEEP)for(let k=0;k<SWEEP_STEPS;k++){
    const off=c[0]*n[0]+c[1]*n[1]+c[2]*n[2]+(k/(SWEEP_STEPS-1)-.5)*region.stone.full;
    const a=bestStone(QUICK_TRIES,[...region.cuts,[n[0],n[1],n[2],off+SAW/2]],true,base);if(!a)continue;
    const b=bestStone(QUICK_TRIES,[...region.cuts,[-n[0],-n[1],-n[2],-off+SAW/2]],true,base);if(!b)continue;
    quick.push({total:score(a)+score(b),n,off});
  }
  postMessage({progress:(done+=1)/work});
  const found=[];
  for(const q of quick.sort((p,r)=>r.total-p.total).slice(0,FULL_PLANES)){
    const a=bestStone(tries,[...region.cuts,[q.n[0],q.n[1],q.n[2],q.off+SAW/2]]);if(!a)continue;
    const b=bestStone(tries,[...region.cuts,[-q.n[0],-q.n[1],-q.n[2],-q.off+SAW/2]]);if(!b)continue;
    found.push({total:score(a)+score(b),n:q.n,off:q.off,a,b});
    postMessage({progress:(done+=1)/work});
  }
  return found.sort((p,q)=>q.total-p.total).slice(0,BEAM_SPLITS);
}
// Three stones planned two saws ahead, ranked by polished weight as Advisor's program does, then priced.
function quickCuts(region,dirs,steps,tries){
  const c=region.stone.center,base=maskCells(region.cuts),out=[];
  for(const n of dirs)for(let k=0;k<steps;k++){
    const off=c[0]*n[0]+c[1]*n[1]+c[2]*n[2]+(k/(steps-1)-.5)*region.stone.full;
    const cutA=[n[0],n[1],n[2],off+SAW/2],cutB=[-n[0],-n[1],-n[2],-off+SAW/2];
    const a=bestStone(tries,[...region.cuts,cutA],true,base);if(!a)continue;
    const b=bestStone(tries,[...region.cuts,cutB],true,base);if(!b)continue;
    out.push({total:score(a)+score(b),n,off,cutA,cutB,a,b});
  }
  return out.sort((p,q)=>q.total-p.total);
}
function tripletSearch(root){
  const prices=PROFIT;PROFIT=null;
  const plans=[];
  for(const first of quickCuts(root,SWEEP,SWEEP_STEPS,QUICK_TRIES).slice(0,TRIPLET_FIRST)){
    const sides=[{cuts:[first.cutA],stone:first.a},{cuts:[first.cutB],stone:first.b}];
    for(const [side,other] of [[sides[0],sides[1]],[sides[1],sides[0]]]){
      const second=quickCuts(side,SWEEP.filter((_,i)=>i%3===0),4,20)[0];
      if(second)plans.push({total:second.total+score(other.stone),first,side,other,second});
    }
    postMessage({progress:Math.min(.9,(done+=1)/work)});
  }
  const built=[];
  for(const p of plans.sort((a,b)=>b.total-a.total).slice(0,TRIPLET_FULL)){
    const rs=[{cuts:p.other.cuts},{cuts:[...p.side.cuts,p.second.cutA]},{cuts:[...p.side.cuts,p.second.cutB]}];
    for(const r of rs)r.stone=bestStone(300,r.cuts);
    if(rs.some(r=>!r.stone))continue;
    const ss=[{normal:p.first.n,offset:p.first.off,within:[],cutA:p.first.cutA,cutB:p.first.cutB},{normal:p.second.n,offset:p.second.off,within:p.side.cuts,cutA:p.second.cutA,cutB:p.second.cutB}];
    refineSaws(rs,ss);
    built.push({rs,ss});
  }
  PROFIT=prices;
  let best=null;
  for(const b of built){
    for(const r of b.rs)r.stone=bestStone(400,r.cuts)||r.stone;
    const t=b.rs.reduce((a,r)=>a+score(r.stone),0);
    if(!best||t>best.t)best={t,rs:b.rs,ss:b.ss};
  }
  return best;
}
// A pie cut: three saws meet along one line, so no saw crosses the whole rough and each stone sits in its own wedge.
function pieSearch(root){
  const prices=PROFIT;PROFIT=null;
  const all=maskCells([]),few=all.filter((_,i)=>i%4===0);
  if(!few.length){PROFIT=prices;return null}
  const mid=[0,1,2].map(k=>all.reduce((t,p)=>t+p[k],0)/all.length),reach=root.stone.full*PIE_SHIFT,tried=[];
  const plane=(n,off)=>({normal:n,offset:off,within:[],pie:true,cutA:[n[0],n[1],n[2],off+SAW/2],cutB:[-n[0],-n[1],-n[2],-off+SAW/2]});
  const layout=(c,e1,e2,angles)=>{
    const ss=angles.map(t=>{
      const n=[0,1,2].map(k=>-Math.sin(t)*e1[k]+Math.cos(t)*e2[k]),d=[0,1,2].map(k=>Math.cos(t)*e1[k]+Math.sin(t)*e2[k]);
      const w=plane(n,c[0]*n[0]+c[1]*n[1]+c[2]*n[2]);
      w.stops=[[d[0],d[1],d[2],c[0]*d[0]+c[1]*d[1]+c[2]*d[2]]];
      return w;
    });
    return{ss,rs:ss.map((w,i)=>({cuts:[w.cutA,ss[(i+1)%3].cutB]}))};
  };
  for(const u of SWEEP.filter((_,i)=>i%4===0)){
    const seed=Math.abs(u[0])<.9?[1,0,0]:[0,1,0],x=[u[1]*seed[2]-u[2]*seed[1],u[2]*seed[0]-u[0]*seed[2],u[0]*seed[1]-u[1]*seed[0]],l=Math.hypot(...x),e1=x.map(v=>v/l);
    const e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
    for(const [a,b] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
      const c=mid.map((v,k)=>v+(a*e1[k]+b*e2[k])*reach);
      for(const turn of [0,.5,1,1.5])for(const [g1,g2] of PIE_ANGLES){
        const start=turn*Math.PI/3*2,plan=layout(c,e1,e2,[start,start+g1,start+g1+g2]);
        let total=0,ok=true;
        for(const r of plan.rs){
          const from=few.filter(p=>p[0]*r.cuts[0][0]+p[1]*r.cuts[0][1]+p[2]*r.cuts[0][2]>=r.cuts[0][3]);
          const stone=from.length?bestStone(PIE_QUICK,r.cuts,true,from):null;
          if(!stone){ok=false;break}
          total+=score(stone);
        }
        if(ok)tried.push({total,c,e1,e2,angles:[start,start+g1,start+g1+g2]});
      }
    }
    postMessage({progress:Math.min(.95,(done+=1)/work)});
  }
  const built=[];
  for(const t of tried.sort((a,b)=>b.total-a.total).slice(0,PIE_FULL)){
    const fit=(c,angles)=>{
      const plan=layout(c,t.e1,t.e2,angles);
      for(const r of plan.rs)r.stone=bestStone(PIE_TRIES,r.cuts);
      plan.total=plan.rs.some(r=>!r.stone)?-Infinity:plan.rs.reduce((a,r)=>a+score(r.stone),0);
      return plan;
    };
    // The three saws move together, so they always meet on one line.
    let cur=t.c,ang=t.angles,plan=fit(cur,ang);
    for(let i=0;i<PIE_ROUNDS;i++){
      const shrink=1-i/PIE_ROUNDS*.7,c=cur.map((v,k)=>v+(gauss()*t.e1[k]+gauss()*t.e2[k])*60*shrink),a=ang.map(v=>v+gauss()*.1*shrink),next=fit(c,a);
      if(next.total>plan.total){plan=next;cur=c;ang=a}
    }
    if(plan.total>-Infinity)built.push(plan);
  }
  PROFIT=prices;
  let best=null;
  for(const b of built){
    for(const r of b.rs)r.stone=bestStone(400,r.cuts)||r.stone;
    const t=b.rs.reduce((a,r)=>a+score(r.stone),0);
    if(!best||t>best.t)best={t,rs:b.rs,ss:b.ss};
  }
  return best;
}
const PIE_SHIFT=.18,PIE_QUICK=15,PIE_FULL=3,PIE_ROUNDS=14,PIE_TRIES=120,PIE_ANGLES=[[2.094,2.094],[1.745,2.269],[2.269,1.745],[1.571,2.356]];
// Stones first: three stones take their places, the saws are worked out from them, the stones grow into the
// room the saws leave, and the saws are worked out again. Only layouts a plate can really cut are kept.
function outlinePoints(st){
  const {center:c,axis:a,D,cut:p}=st,R=D/2,seed=Math.abs(a[0])<.9?[1,0,0]:[0,1,0];
  let u=[a[1]*seed[2]-a[2]*seed[1],a[2]*seed[0]-a[0]*seed[2],a[0]*seed[1]-a[1]*seed[0]];const l=Math.hypot(...u);u=u.map(v=>v/l);
  const v=[a[1]*u[2]-a[2]*u[1],a[2]*u[0]-a[0]*u[2],a[0]*u[1]-a[1]*u[0]],top=-p.crown*D,gird=p.girdle*D,cul=gird+p.pavilion*D,rt=p.table*R,out=[];
  for(const [r,z] of [[rt,top],[R,0],[R,gird]])for(let i=0;i<16;i++){
    const e=r*Math.cos(i*Math.PI/8),f=r*Math.sin(i*Math.PI/8);
    out.push([0,1,2].map(k=>c[k]+z*a[k]+e*u[k]+f*v[k]));
  }
  out.push([0,1,2].map(k=>c[k]+cul*a[k]));
  return out;
}
// The plane with the widest gap between two sets of points, from a to b.
function widestGap(a,b){
  const mean=q=>[0,1,2].map(k=>q.reduce((t,p)=>t+p[k],0)/q.length),ma=mean(a),mb=mean(b);
  let n=[0,1,2].map(k=>mb[k]-ma[k]),l=Math.hypot(...n);n=n.map(v=>v/l);
  let best=null;
  for(let i=0;i<GAP_STEPS;i++){
    let hi=-Infinity,lo=Infinity,x=null,y=null;
    for(const p of a){const d=p[0]*n[0]+p[1]*n[1]+p[2]*n[2];if(d>hi){hi=d;x=p}}
    for(const p of b){const d=p[0]*n[0]+p[1]*n[1]+p[2]*n[2];if(d<lo){lo=d;y=p}}
    if(!best||lo-hi>best.gap)best={n:[...n],off:(lo+hi)/2,gap:lo-hi};
    const w=[0,1,2].map(k=>y[k]-x[k]),m=Math.hypot(...w)||1,step=.35*(1-i/GAP_STEPS)+.02;
    n=n.map((v,k)=>v*(1-step)+w[k]/m*step);l=Math.hypot(...n);n=n.map(v=>v/l);
  }
  return best;
}
const sawPlane=(g,within)=>({normal:g.n,offset:g.off,within,cutA:[g.n[0],g.n[1],g.n[2],g.off+SAW/2],cutB:[-g.n[0],-g.n[1],-g.n[2],-g.off+SAW/2]});
// One saw splits off a stone, the second divides the other two. Takes the order with the most room.
function sawsFor(list){
  let best=null;
  list.forEach((one,i)=>{
    const rest=list.filter((_,k)=>k!==i),pts=list.map(outlinePoints),other=rest.map(outlinePoints);
    const first=widestGap(pts[i],[...other[0],...other[1]]),second=widestGap(other[0],other[1]);
    if(first.gap<SAW||second.gap<SAW)return;
    const room=Math.min(first.gap,second.gap);
    if(!best||room>best.room)best={room,first,second,order:[i,...list.keys()].filter((k,m,q)=>q.indexOf(k)===m)};
  });
  return best;
}
// The stone grows where it already sits, so a good position survives a change of saws.
function growStone(st,cuts,tune=GROW_TUNE){
  const full=largest(st.center,st.axis,st.cut,cuts);
  return full?tuneStone({D:sized(full,st.cut),full,center:st.center,axis:st.axis,cut:st.cut},cuts,tune):null;
}
// Fits one stone in each part, or gives up when a part has no room.
function fitParts(rs,ss,tries,seeds=[]){
  rs.forEach((r,k)=>{
    r.stone=bestStone(tries,r.cuts);
    const kept=seeds[k]&&growStone(seeds[k],r.cuts);
    if(kept&&(!r.stone||score(kept)>score(r.stone)))r.stone=kept;
  });
  if(rs.some(r=>!r.stone))return null;
  return{rs,ss,t:rs.reduce((t,r)=>t+score(r.stone),0)};
}
// Three-way cut, as Advisor's pie: two plates bent around one stone, and a saw between the other two that stops at them.
function threeWay(list,tries,seeds=list){
  let best=null;
  const pts=list.map(outlinePoints);
  list.forEach((_,i)=>{
    const [a,b]=[0,1,2].filter(k=>k!==i),g1=widestGap(pts[i],pts[a]),g2=widestGap(pts[i],pts[b]),g3=widestGap(pts[a],pts[b]);
    if(g1.gap<SAW||g2.gap<SAW||g3.gap<SAW)return;
    const p1={...sawPlane(g1,[]),pie:true},p2={...sawPlane(g2,[]),pie:true},saw=sawPlane(g3,[]);
    const plan=fitParts([{cuts:[p1.cutB,p2.cutB]},{cuts:[p1.cutA,saw.cutB]},{cuts:[p2.cutA,saw.cutA]}],[p1,p2,saw],tries,[seeds[i],seeds[a],seeds[b]]);
    if(plan&&(!best||plan.t>best.t))best=plan;
  });
  return best;
}
// Stones that nearly touch are drawn a little smaller to find the saws, then grow back up to them.
function cutFromStones(list,tries){
  for(const f of ROOM_STEPS){
    const plan=cutAround(list.map(s=>({...s,D:s.D*f})),list,tries);
    if(plan)return plan;
  }
  return null;
}
function cutAround(list,seeds,tries){
  if(list.length===2){
    const g=widestGap(outlinePoints(list[0]),outlinePoints(list[1]));
    if(g.gap<SAW)return null;
    const a=sawPlane(g,[]);
    return fitParts([{cuts:[a.cutB]},{cuts:[a.cutA]}],[a],tries,seeds);
  }
  const plan=sawsFor(list);
  let best=null;
  if(plan){
    // The first saw splits off one stone; the second divides the part holding the other two.
    const a=sawPlane(plan.first,[]),side=a.cutA,b=sawPlane(plan.second,[side]);
    best=fitParts([{cuts:[a.cutB]},{cuts:[side,b.cutB]},{cuts:[side,b.cutA]}],[a,b],tries,plan.order.map(k=>seeds[k]));
  }
  // Fewer plates are better: the third plate has to earn clearly more.
  const three=threeWay(list,tries,seeds);
  return three&&(!best||three.t>best.t*PLATE_MARGIN)?three:best;
}
// How far each point of the rough is from its surface and from the nearest blocking inclusion, most open first.
// Random quick fits rate a saw too unreliably; the largest clear ball on each side rates it the same every time.
let CLEAR=null;
function clearCells(){
  if(CLEAR)return CLEAR;
  const all=maskCells([]),near=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],block=[];
  for(const p of all)if(near.some(d=>!inside(p[0]+d[0]*VOXEL,p[1]+d[1]*VOXEL,p[2]+d[2]*VOXEL)))block.push(p[0],p[1],p[2]);
  for(let i=0;i<points.length;i+=3)if(sizes[i/3]>=1)block.push(points[i],points[i+1],points[i+2]);
  // Nearest blocker by searching rings of grid cubes outward; a ring k cubes out is at least (k-1) cubes away.
  const pts=Float64Array.from(block),g=pointGrid(pts),G=g.cell,out=[];
  for(let i=0;i<all.length;i+=CLEAR_STEP){
    const p=all[i],cx=Math.floor((p[0]-g.lo[0])/G),cy=Math.floor((p[1]-g.lo[1])/G),cz=Math.floor((p[2]-g.lo[2])/G);
    let m=Infinity;
    for(let k=0;k<=Math.max(...g.n)+2;k++){
      if(k>1&&((k-1)*G)**2>=m)break;
      for(let ix=cx-k;ix<=cx+k;ix++)for(let iy=cy-k;iy<=cy+k;iy++)for(let iz=cz-k;iz<=cz+k;iz++){
        if(Math.max(Math.abs(ix-cx),Math.abs(iy-cy),Math.abs(iz-cz))!==k)continue;
        if(ix<0||iy<0||iz<0||ix>=g.n[0]||iy>=g.n[1]||iz>=g.n[2])continue;
        const cell=(ix*g.n[1]+iy)*g.n[2]+iz;
        for(let j=g.start[cell];j<g.start[cell+1];j++){const q=g.order[j],a=pts[q]-p[0],b=pts[q+1]-p[1],c=pts[q+2]-p[2],d=a*a+b*b+c*c;if(d<m)m=d}
      }
    }
    out.push({p,r:Math.sqrt(m)});
  }
  return CLEAR=out.sort((a,b)=>b.r-a.r);
}
// The largest clear ball on the inner side of a cut.
function ballOn(cells,n,off){
  let best=0;
  for(const c of cells){
    if(c.r<=best)break;
    const d=c.p[0]*n[0]+c.p[1]*n[1]+c.p[2]*n[2]-off,m=Math.min(c.r,d);
    if(m>best)best=m;
  }
  return best;
}
// A rough value of the stone a clear ball can hold. On Advisor's plans the stone is about 3.2 times the ball radius.
function ballValue(r,prices){
  const D=r*BALL_TO_D,c=CUTS[0];
  if(!prices)return c.k*(D/1000)**3;
  const keep=PROFIT;PROFIT=prices;
  const v=Math.max(0,score({D:sized(D,c),cut:c}));
  PROFIT=keep;return v;
}
// Every saw of a fine sweep, rated by the two clear balls, keeping good saws that differ from each other:
// half chosen by weight, half by profit, because the price step can favour two middle stones over one big one.
function ballSaws(want,prices=null){
  const cells=clearCells(),out=[];
  for(const n of FINE_SWEEP){
    let lo=Infinity,hi=-Infinity;
    for(const c of cells){const d=c.p[0]*n[0]+c.p[1]*n[1]+c.p[2]*n[2];if(d<lo)lo=d;if(d>hi)hi=d}
    for(let off=lo+FINE_STEP;off<hi;off+=FINE_STEP){
      const a=ballOn(cells,n,off+SAW/2),b=ballOn(cells,[-n[0],-n[1],-n[2]],-off+SAW/2);
      if(a>0&&b>0)out.push({n,off,a,b,t:a**3+b**3,p:prices?ballValue(a,prices)+ballValue(b,prices):0});
    }
  }
  const kept=[],apart=q=>kept.every(k=>{const d=k.n[0]*q.n[0]+k.n[1]*q.n[1]+k.n[2]*q.n[2];return d<FINE_APART||Math.abs(k.off-q.off)>FINE_GAP});
  for(const key of prices?['t','p']:['t']){
    const goal=kept.length+(prices&&key==='t'?Math.ceil(want/2):want-kept.length);
    for(const q of [...out].sort((a,b)=>b[key]-a[key])){
      if(apart(q))kept.push(q);
      if(kept.length>=goal)break;
    }
  }
  return kept;
}
// Starts from the most open places of a part instead of anywhere in it.
// The most open places of a part. The list is sorted by clearance, so the scan stops as soon as no later place can
// beat the ones kept; ties keep list order, as a full sort would.
function openCells(cuts,k){
  const best=[];
  for(const c of clearCells()){
    if(best.length===k&&c.r<=best[k-1].m)break;
    let m=c.r;
    for(const n of cuts){const d=c.p[0]*n[0]+c.p[1]*n[1]+c.p[2]*n[2]-n[3];if(d<m)m=d}
    if(m<=0||(best.length===k&&m<=best[k-1].m))continue;
    let at=best.length;
    while(at>0&&best[at-1].m<m)at--;
    best.splice(at,0,{p:c.p,m});
    if(best.length>k)best.pop();
  }
  return best.map(c=>c.p);
}
function openStone(cuts,tries=OPEN_TRIES,tune=OPEN_TUNE){
  const from=openCells(cuts,OPEN_CELLS);
  if(!from.length)return null;
  const st=bestStone(tries,cuts,false,from);
  return st&&growStone(st,cuts,tune);
}
// Best pair: the sweep only finds the area of a good saw, so each good saw is then moved in small steps while
// both stones grow where they sit. Ranked by polished weight, then priced.
function pairSearch(root){
  const prices=PROFIT,cutsOf=(n,off)=>[[n[0],n[1],n[2],off+SAW/2],[-n[0],-n[1],-n[2],-off+SAW/2]];
  // A clear ball can overrate a side where a stone does not fit its shape, so many saws get a quick real fit,
  // rated by profit, and only the best go on to the small moves.
  const value=(a,b)=>[a,b].reduce((t,o)=>t+(prices?(PROFIT=prices,score({...o,D:sized(o.D,o.cut)})):weight(o)),0);
  const screened=[];
  for(const q of ballSaws(PAIR_SCREEN,prices)){
    PROFIT=null;
    const [ca,cb]=cutsOf(q.n,q.off),a=openStone([ca],SCREEN_TRIES,SCREEN_TUNE),b=a&&openStone([cb],SCREEN_TRIES,SCREEN_TUNE);
    if(b)screened.push({n:q.n,off:q.off,a,b,v:value(a,b)});
  }
  PROFIT=null;
  const plans=[];
  for(const q of screened.sort((x,y)=>y.v-x.v).slice(0,PAIR_FIRST)){
    let {n,off,a,b}=q;
    for(let i=0;i<PAIR_ROUNDS;i++){
      const shrink=1-i/PAIR_ROUNDS*.8,mid=a.center.map((e,k)=>(e+b.center[k])/2),raw=n.map(e=>e+gauss()*.12*shrink),l=Math.hypot(...raw),v=raw.map(e=>e/l);
      const off2=off+[0,1,2].reduce((t,k)=>t+mid[k]*(v[k]-n[k]),0)+gauss()*70*shrink,[c1,c2]=cutsOf(v,off2);
      const a2=growStone(a,[c1],PAIR_TUNE),b2=a2&&growStone(b,[c2],PAIR_TUNE);
      if(b2&&score(a2)+score(b2)>score(a)+score(b)){a=a2;b=b2;n=v;off=off2}
    }
    plans.push({n,off,a,b,t:score(a)+score(b)});
    postMessage({progress:Math.min(.95,(done+=1)/work)});
  }
  PROFIT=prices;
  // Ranked by profit of the stones as they are, held below the blocked sizes, so a pair of middle stones can win.
  const worth=p=>[p.a,p.b].reduce((t,o)=>t+(prices?score({...o,D:sized(o.D,o.cut)}):score(o)),0);
  return plans.sort((p,q)=>worth(q)-worth(p)).slice(0,PAIR_FULL).map(p=>{
    // The same small moves again, now judged by profit.
    let a=growStone(p.a,cutsOf(p.n,p.off).slice(0,1),PAIR_TUNE)||p.a,b=growStone(p.b,cutsOf(p.n,p.off).slice(1),PAIR_TUNE)||p.b,n=p.n,off=p.off;
    for(let i=0;i<PAIR_ROUNDS;i++){
      const shrink=1-i/PAIR_ROUNDS*.8,mid=a.center.map((e,k)=>(e+b.center[k])/2),raw=n.map(e=>e+gauss()*.06*shrink),l=Math.hypot(...raw),v=raw.map(e=>e/l);
      const off2=off+[0,1,2].reduce((t,k)=>t+mid[k]*(v[k]-n[k]),0)+gauss()*35*shrink,[c1,c2]=cutsOf(v,off2);
      const a2=growStone(a,[c1],PAIR_TUNE),b2=a2&&growStone(b,[c2],PAIR_TUNE);
      if(b2&&score(a2)+score(b2)>score(a)+score(b)){a=a2;b=b2;n=v;off=off2}
    }
    const [cutA,cutB]=cutsOf(n,off),rs=[{cuts:[cutA],stone:a},{cuts:[cutB],stone:b}];
    return{rs,ss:[{normal:n,offset:off,within:[],cutA,cutB}],t:score(a)+score(b),heavy:[p.a,p.b],kind:'best pair'};
  });
}
// Best remainder: a good pair stays where it is and a third stone goes in the room left around it.
function remainders(pairs,few){
  const out=[];
  for(const p of pairs){
    const edges=p.heavy.map(outlinePoints),room=few.filter(q=>p.heavy.every(o=>Math.hypot(q[0]-o.center[0],q[1]-o.center[1],q[2]-o.center[2])>o.D/2));
    for(let i=0;i<REMAINDER_SEEDS&&room.length;i++){
      const q=room[rnd()*room.length|0],cuts=p.heavy.map((o,k)=>{
        const w=[0,1,2].map(j=>q[j]-o.center[j]),l=Math.hypot(...w),u=w.map(e=>e/l);
        return[u[0],u[1],u[2],Math.max(...edges[k].map(e=>e[0]*u[0]+e[1]*u[1]+e[2]*u[2]))+SAW];
      }),third=openStone(cuts);
      if(third)out.push([...p.heavy,third]);
    }
  }
  return out;
}
// Advisor's best plans often hold one big stone and small ones around it. The heaviest stone of the rough is held
// at a few sizes and the others are placed in the room left around it.
function bigFirst(few,count){
  // A few heavy single stones from separate searches, as the big stone may sit in more than one good place.
  const bigs=Array.from({length:BIG_PLACES},()=>bestStone(BIG_TRIES,[])).filter(Boolean),out=[];
  if(!bigs.length)return out;
  for(let i=0;i<BIG_SEEDS;i++){
    const big=bigs[i%bigs.length],c0=big.center,st={...big,D:big.full*BIG_SCALES[Math.floor(i/bigs.length)%BIG_SCALES.length]},edge=outlinePoints(st);
    const room=few.filter(q=>Math.hypot(q[0]-c0[0],q[1]-c0[1],q[2]-c0[2])>st.D/2);
    if(!room.length)continue;
    const p=Array.from({length:count-1},()=>room[rnd()*room.length|0]);
    const cutsOf=k=>{
      const n=[0,1,2].map(j=>p[k][j]-c0[j]),l=Math.hypot(...n),u=n.map(v=>v/l);
      const cuts=[[u[0],u[1],u[2],Math.max(...edge.map(e=>e[0]*u[0]+e[1]*u[1]+e[2]*u[2]))+SAW]];
      for(const q of p){
        if(q===p[k])continue;
        const w=[0,1,2].map(j=>p[k][j]-q[j]),m=Math.hypot(...w)||1,v=w.map(e=>e/m);
        cuts.push([v[0],v[1],v[2],(p[k].reduce((t,e,j)=>t+e*v[j],0)+q.reduce((t,e,j)=>t+e*v[j],0))/2+SAW/2]);
      }
      return cuts;
    };
    const list=[st];
    for(let k=0;k<p.length;k++){
      const c=cutsOf(k),small=openStone(c,BIG_SMALL_TRIES,BIG_SMALL_TUNE);
      if(!small)break;
      list.push(small);
    }
    if(list.length===count)out.push(list);
    if(i%10===0)postMessage({progress:Math.min(.95,(done+=1)/work)});
  }
  return out;
}
function stonesFirst(root,starts,count=3,pairs=[]){
  const prices=PROFIT;PROFIT=null;
  const few=maskCells([]).filter((_,i)=>i%4===0),tried=[...starts];
  const far=root.stone.full*.3;
  for(let i=0;i<JOINT_SEEDS&&few.length;i++){
    const p=Array.from({length:count},()=>few[rnd()*few.length|0]);
    if(p.some((q,k)=>p.some((w,m)=>m>k&&Math.hypot(q[0]-w[0],q[1]-w[1],q[2]-w[2])<far)))continue;
    const cutsOf=k=>p.filter((_,m)=>m!==k).map(q=>{
      const n=[0,1,2].map(j=>p[k][j]-q[j]),l=Math.hypot(...n),u=n.map(v=>v/l);
      return[u[0],u[1],u[2],(p[k].reduce((t,v,j)=>t+v*u[j],0)+q.reduce((t,v,j)=>t+v*u[j],0))/2+SAW/2];
    });
    const list=[];
    for(let k=0;k<count;k++){
      const c=cutsOf(k),from=few.filter(q=>q[0]*c[0][0]+q[1]*c[0][1]+q[2]*c[0][2]>=c[0][3]),st=from.length?bestStone(JOINT_QUICK,c,true,from):null;
      if(!st)break;
      list.push(st);
    }
    if(list.length===count)tried.push(list);
    if(i%10===0)postMessage({progress:Math.min(.95,(done+=1)/work)});
  }
  const sum=l=>l.reduce((t,o)=>t+score(o),0);
  const built=[],bigs=bigFirst(few,count).sort((a,b)=>sum(b)-sum(a)).slice(0,BIG_FULL);
  const rest=remainders(pairs,few).sort((a,b)=>sum(b)-sum(a)).slice(0,REMAINDER_FULL);
  for(const list of [...tried.sort((a,b)=>sum(b)-sum(a)).slice(0,JOINT_FULL),...bigs,...rest]){
    let cur=cutFromStones(list,120);
    if(!cur)continue;
    for(let i=0;i<JOINT_ROUNDS;i++){
      const next=cutFromStones(cur.rs.map(r=>r.stone),120);
      if(!next||next.t<=cur.t)break;
      cur=next;
    }
    refineSaws(cur.rs,cur.ss);
    built.push(cur);
  }
  PROFIT=prices;
  let best=null;
  for(const b of built){
    for(const r of b.rs){
      const fresh=bestStone(400,r.cuts),kept=growStone(r.stone,r.cuts);
      r.stone=[fresh,kept,r.stone].filter(Boolean).reduce((x,y)=>score(y)>score(x)?y:x);
    }
    b.t=b.rs.reduce((a,r)=>a+score(r.stone),0);
    if(!best||b.t>best.t)best=b;
  }
  if(best){refineSaws(best.rs,best.ss);best.t=best.rs.reduce((a,r)=>a+score(r.stone),0)}
  return best;
}
const USE_PIE=false,PLATE_MARGIN=1.05,GROW_TUNE=30,ROOM_STEPS=[1,.997,.99,.98,.96],GAP_STEPS=60,JOINT_SEEDS=120,JOINT_QUICK=10,JOINT_FULL=3,JOINT_ROUNDS=3,BIG_TRIES=200,BIG_SEEDS=60,BIG_SCALES=[.8,.85,.9,.95,1],BIG_FULL=3,BIG_SMALL_TRIES=40,BIG_PLACES=3,BIG_SMALL_TUNE=20,PAIR_FIRST=10,PAIR_SCREEN=48,SCREEN_TRIES=20,SCREEN_TUNE=10,BALL_TO_D=3.2,PAIR_ROUNDS=30,CLEAR_STEP=3,FINE_STEP=50,FINE_APART=.985,FINE_GAP=100,OPEN_CELLS=30,OPEN_TRIES=60,OPEN_TUNE=40,PAIR_TUNE=8,PAIR_FULL=3,REMAINDER_SEEDS=6,REMAINDER_FULL=4;
const TRIPLET_FIRST=14,TRIPLET_FULL=3;
const PLANES=12,SWEEP_DIRECTIONS=48,SWEEP_STEPS=6,QUICK_TRIES=30,FULL_PLANES=PLANES;
// Directions spread evenly over half a sphere; a plane and its reverse are the same cut.
const FINE_SWEEP=Array.from({length:240},(_,i)=>{
  const z=(i+.5)/240,r=Math.sqrt(1-z*z),t=i*Math.PI*(3-Math.sqrt(5));
  return[r*Math.cos(t),r*Math.sin(t),z];
});
const SWEEP=Array.from({length:SWEEP_DIRECTIONS},(_,i)=>{
  const z=(i+.5)/SWEEP_DIRECTIONS,r=Math.sqrt(1-z*z),t=i*Math.PI*(3-Math.sqrt(5));
  return[r*Math.cos(t),r*Math.sin(t),z];
});
// Moves each saw plane a little and refits the stones on both sides together, keeping a move only when the total score rises.
function refineSaws(regions,saws){
  const total=rs=>rs.reduce((t,r)=>t+score(r.stone),0);
  for(let round=0;round<REFINE_ROUNDS;round++){
    for(const saw of saws){
      const shrink=1-round/REFINE_ROUNDS*.7,v=saw.normal.map(e=>e+gauss()*.06*shrink),l=Math.hypot(...v),n=v.map(e=>e/l),off=saw.offset+gauss()*40*shrink;
      const a=[n[0],n[1],n[2],off+SAW/2],b=[-n[0],-n[1],-n[2],-off+SAW/2],swap=new Map([[saw.cutA,a],[saw.cutB,b]]);
      const hit=regions.filter(r=>r.cuts.includes(saw.cutA)||r.cuts.includes(saw.cutB));
      const trial=hit.map(r=>{const cuts=r.cuts.map(c=>swap.get(c)||c);return{cuts,stone:growStone(r.stone,cuts,REFINE_TUNE)}});
      if(trial.some(t=>!t.stone))continue;
      if(total(trial)<=total(hit))continue;
      hit.forEach((r,i)=>{r.cuts=trial[i].cuts;r.stone=trial[i].stone});
      for(const o of saws)o.within=o.within.map(c=>swap.get(c)||c);
      saw.normal=n;saw.offset=off;saw.cutA=a;saw.cutB=b;
    }
    postMessage({progress:Math.min(.99,.5+round/REFINE_ROUNDS/2)});
  }
}
const REFINE_ROUNDS=24,REFINE_TUNE=15,BEAM=3,BEAM_SPLITS=2;
let done=0,work=1;
// Experimental single-stone search (not used by Auto plan). Starts: the most open places of the rough and an even
// spread through it; every start is tried in an even spread of directions and a few cuts; the best are refined by
// a step search (centre, tilt, cut) whose steps halve until nothing helps; the finish tries a finer set of cuts.
function sphereDirs(n){
  return Array.from({length:n},(_,i)=>{const z=1-2*(i+.5)/n,r=Math.sqrt(1-z*z),t=i*Math.PI*(3-Math.sqrt(5));return[r*Math.cos(t),r*Math.sin(t),z]});
}
function singleStarts(o){
  const open=openCells([],o.open),all=maskCells([]),step=Math.max(1,Math.floor(all.length/o.spread)),out=[...open];
  for(let i=Math.floor(step/2);i<all.length;i+=step)out.push(all[i]);
  return out;
}
function tilt(a,u,ang){
  // turns a towards u (perpendicular to a) by ang radians
  const c=Math.cos(ang),s=Math.sin(ang),v=a.map((x,k)=>x*c+u[k]*s),l=Math.hypot(...v);return v.map(x=>x/l);
}
function perp(a){
  const s=Math.abs(a[0])<.9?[1,0,0]:[0,1,0];let u=[a[1]*s[2]-a[2]*s[1],a[2]*s[0]-a[0]*s[2],a[0]*s[1]-a[1]*s[0]];const l=Math.hypot(...u);u=u.map(x=>x/l);
  return[u,[a[1]*u[2]-a[2]*u[1],a[2]*u[0]-a[0]*u[2],a[0]*u[1]-a[1]*u[0]]];
}
function stepSearch(st,cuts,cutList,o){
  let best=st,cs=o.centreStep,as=o.angleStep*Math.PI/180;
  const tryIt=(c,a,cut)=>{const full=largest(c,a,cut,cuts);if(full&&weight({D:full,cut})>weight(best)){best={D:full,full,center:c,axis:a,cut};return true}return false};
  while(cs>=o.centreMin||as>=o.angleMin*Math.PI/180){
    let moved=false;
    for(let k=0;k<3;k++)for(const d of [cs,-cs]){const c=[...best.center];c[k]+=d;moved=tryIt(c,best.axis,best.cut)||moved}
    const [u,v]=perp(best.axis);
    for(const w of [u,v])for(const d of [as,-as])moved=tryIt(best.center,tilt(best.axis,w,d),best.cut)||moved;
    for(const cut of cutList)if(cut!==best.cut)moved=tryIt(best.center,best.axis,cut)||moved;
    if(!moved){cs/=2;as/=2}
  }
  return best;
}
// Self-adjusting climb: a random small move of the centre and the direction together; the move size grows after a
// success and shrinks after misses, so the climb can follow a narrow, tilted ridge down to about 1 um and 0.05 deg.
function climb(st,cuts,o){
  let best=st,cs=o.climbCentre,as=o.climbAngle*Math.PI/180,miss=0;
  const better=(c,a,cut)=>{const full=largest(c,a,cut,cuts);return full&&weight({D:full,cut})>weight(best)?{D:full,full,center:c,axis:a,cut}:null};
  for(let i=0;i<o.climbSteps&&(cs>o.centreMin||as>o.angleMin*Math.PI/180);i++){
    const [u,v]=perp(best.axis),c=best.center.map(x=>x+gauss()*cs),a=tilt(tilt(best.axis,u,gauss()*as),v,gauss()*as);
    const next=better(c,a,best.cut);
    if(next){best=next;cs*=1.5;as*=1.5;miss=0}
    else if(++miss>=4){cs*=.82;as*=.82;miss=0}
  }
  for(const cut of CUTS){const next=better(best.center,best.axis,cut);if(next)best=next}
  return best;
}
function singleTask(data){
  const out=[];
  if(data.step==='singleSample'){
    // Random places and directions (both ways up), each from its own seed so a part gives the same result every run.
    seed=1000+data.part;
    const cells=maskCells([]),keep=[];
    for(let t=0;t<data.opt.samples;t++){
      const q=cells[rnd()*cells.length|0],c=[q[0]+(rnd()-.5)*VOXEL,q[1]+(rnd()-.5)*VOXEL,q[2]+(rnd()-.5)*VOXEL],g=[gauss(),gauss(),gauss()],l=Math.hypot(...g),a=g.map(x=>x/l),cut=CUTS[t%CUTS.length],full=largest(c,a,cut,[]);
      if(full)keep.push({D:full,full,center:c,axis:a,cut});
    }
    out.push(...keep.sort((x,y)=>weight(y)-weight(x)).slice(0,data.opt.keepPerPart));
  }else if(data.step==='singleClimb'){
    seed=2000+data.part;
    for(const st of data.stones)out.push(climb(st,[],data.opt));
  }else
  if(data.step==='singleStart'){
    const starts=singleStarts(data.opt).filter((_,i)=>i%data.parts===data.part),dirs=sphereDirs(data.opt.dirs),cutList=data.opt.cutList.map(k=>CUTS[k%CUTS.length]);
    for(const c of starts){
      let best=null;
      for(const a of dirs)for(const cut of cutList){const full=largest(c,a,cut,[]);if(full&&(!best||weight({D:full,cut})>weight(best)))best={D:full,full,center:[...c],axis:a,cut}}
      if(best)out.push(best);
    }
  }else if(data.step==='singleRefine'){
    for(const st of data.stones)out.push(stepSearch(st,[],CUTS,data.opt));
  }else if(data.step==='singleFinish'){
    // A finer set of cuts at the refined place, a short climb and a last step search, all against every original
    // inclusion point, so nothing is lost to the final check after the search.
    points=data.allInclusions;sizes=data.allSizes;seed=3000;
    for(const st of data.stones){
      let best={...st};
      while(best.D>MIN_D&&!fits(best.center,best.axis,best.D,best.cut,[]))best.D-=2;
      best.full=best.D;
      for(const cut of data.fine){const full=largest(st.center,st.axis,cut,[]);if(full&&weight({D:full,cut})>weight(best))best={D:full,full,center:st.center,axis:st.axis,cut}}
      if(data.opt.finishClimb)best=climb(best,[],{...data.opt,climbCentre:data.opt.finishClimbCentre,climbAngle:data.opt.finishClimbAngle,climbSteps:data.opt.finishClimbSteps});
      best=stepSearch(best,[],data.fine,data.opt);
      const o={...best};
      while(o.D>MIN_D&&!fits(o.center,o.axis,o.D,o.cut,[]))o.D-=2;
      o.full=o.D;o.valid=o.D>MIN_D&&fits(o.center,o.axis,o.D,o.cut,[]);
      out.push(o);
    }
    points=data.inclusions;sizes=data.sizes;
  }
  postMessage({single:out,fits:DIAG.fits});
}
// Experimental facet alignment (not used by Auto plan). Advisor's stones lie either with the table flat on the saw
// (stone axis along the saw's normal) or with a pavilion facet flat on it (axis tilted by the pavilion angle, culet
// towards the saw). u is the inward normal of the side; phi turns the tilt around the saw's normal.
function alignedAxis(u,mode,phi,cut){
  if(mode==='table')return[...u];
  const pa=Math.atan(2*cut.pavilion),s=Math.abs(u[0])<.9?[1,0,0]:[0,1,0];
  let e1=[u[1]*s[2]-u[2]*s[1],u[2]*s[0]-u[0]*s[2],u[0]*s[1]-u[1]*s[0]];const l=Math.hypot(...e1);e1=e1.map(v=>v/l);
  const e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]],w=e1.map((v,k)=>v*Math.cos(phi)+e2[k]*Math.sin(phi));
  return u.map((v,k)=>-v*Math.cos(pa)+w[k]*Math.sin(pa));
}
// A stone standing on the saw face: its nearest point to the saw touches the face, so its centre moves away from the
// saw as it grows. The size is found by halving, as in largest(), with the centre recomputed for each size.
function standingSupport(a,cut,u){
  const pts=outlinePoints({center:[0,0,0],axis:a,D:1000,cut});
  return Math.max(...pts.map(p=>-(p[0]*u[0]+p[1]*u[1]+p[2]*u[2])))/1000;
}
function largestStanding(q,a,cut,cut0,f){
  const u=[cut0[0],cut0[1],cut0[2]],base=q.map((v,k)=>v-u[k]*(q[0]*u[0]+q[1]*u[1]+q[2]*u[2]-cut0[3])),at=D=>base.map((v,k)=>v+u[k]*(f*D+1));
  DIAG.fits++;
  if(!fits(at(MIN_D),a,MIN_D,cut,[cut0]))return null;
  let low=MIN_D,high=MAX_D;
  for(let i=0;i<10;i++){const m=(low+high)/2;if(fits(at(m),a,m,cut,[cut0]))low=m;else high=m}
  return{D:low,full:low,center:at(low),axis:a,cut};
}
// The heaviest aligned stone on one side of a saw: each orientation and cut, standing on the saw at the most open
// places along it, then moved along the saw in small steps with the orientation held.
function alignedSide(cut0,o,seed=null){
  const u=[cut0[0],cut0[1],cut0[2]],cells=openCells([cut0],o.centers);
  if(seed)cells.unshift(seed.center);
  if(!cells.length)return null;
  let best=null;
  for(const mode of ['table','pavilion'])for(const phi of mode==='table'?[0]:o.phis)for(const k of o.cutList){
    const cut=CUTS[k%CUTS.length],a=alignedAxis(u,mode,phi,cut),f=standingSupport(a,cut,u);
    for(const c of cells){
      const st=largestStanding(c,a,cut,cut0,f);
      if(st&&(!best||weight(st)>weight(best)))best={...st,mode,phi,f};
    }
  }
  if(!best)return null;
  const s0=Math.abs(u[0])<.9?[1,0,0]:[0,1,0];
  let e1=[u[1]*s0[2]-u[2]*s0[1],u[2]*s0[0]-u[0]*s0[2],u[0]*s0[1]-u[1]*s0[0]];const l=Math.hypot(...e1);e1=e1.map(v=>v/l);
  const e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
  // Moves along the saw start wide (o.reach) and narrow down, so the stone can slide to where it grows largest.
  for(let i=0;i<o.tune;i++){
    const shrink=1-i/o.tune*.9,x=gauss()*o.reach*shrink,y=gauss()*o.reach*shrink,q=best.center.map((v,k)=>v+x*e1[k]+y*e2[k]);
    const st=largestStanding(q,best.axis,best.cut,cut0,best.f);
    if(st&&st.D>best.D)best={...best,...st};
  }
  return best;
}
// Experimental two-stone search (not used by Auto plan): every saw of a sweep splits the rough, the best stone is
// fitted on each side and the pair is judged by total polished weight. The page runs these steps across the pool.
function sweepTask(data){
  CUTS=data.cuts;SAW=data.sawWidth;SAFETY=data.safety||0;ROUGH_SAFETY=data.roughSafety||0;PROFIT=null;
  TABLE_BLOCK=data.autoTable?1:0;CULET_BLOCK=data.autoCulet?1:0;TABLE_T=data.tableDepth/100;CULET_T=data.culetStart/100;BOTTOM_T=1-(data.culetBottom??10)/100;
  buildMask(data.verts,data.tris);points=data.inclusions;sizes=data.sizes;
  const sides=(n,off)=>[[n[0],n[1],n[2],off+SAW/2],[-n[0],-n[1],-n[2],-off+SAW/2]],out=[];
  if(data.step==='fit'){
    for(const [i,n,off] of data.planes){
      const [ca,cb]=sides(n,off),a=openStone([ca],data.tries,data.tune),b=a&&openStone([cb],data.tries,data.tune);
      if(b)out.push({i,n,off,a,b,w:weight(a)+weight(b)});
    }
  }else if(data.step==='aligned'){
    for(const [i,n,off] of data.planes){
      const [ca,cb]=sides(n,off),a=alignedSide(ca,data.opt),b=a&&alignedSide(cb,data.opt);
      if(b)out.push({i,n,off,a,b,w:weight(a)+weight(b)});
    }
  }else if(data.step==='alignedLocal'){
    // Small tilts and shifts of the saw, refitting both aligned stones each time; kept when the pair gets heavier.
    for(const p of data.pairs){
      let best=p;
      const tilt=data.tilt*Math.PI/180,u=p.n,s0=Math.abs(u[0])<.9?[1,0,0]:[0,1,0];
      let e1=[u[1]*s0[2]-u[2]*s0[1],u[2]*s0[0]-u[0]*s0[2],u[0]*s0[1]-u[1]*s0[0]];const l=Math.hypot(...e1);e1=e1.map(v=>v/l);
      const e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
      for(const [x,y] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])for(const d of data.shifts){
        if(!x&&!y&&!d)continue;
        const raw=u.map((v,k)=>v+(x*e1[k]+y*e2[k])*Math.tan(tilt)),m=Math.hypot(...raw),n=raw.map(v=>v/m),off=p.off+d;
        const [ca,cb]=sides(n,off),a=alignedSide(ca,data.opt,best.a),b=a&&alignedSide(cb,data.opt,best.b);
        if(b&&weight(a)+weight(b)>best.w)best={i:p.i,n,off,a,b,w:weight(a)+weight(b)};
      }
      out.push(best);
    }
  }else if(data.step==='climb'){
    for(const p of data.pairs){
      let {n,off,a,b}=p;
      for(let r=0;r<data.rounds;r++){
        const shrink=1-r/data.rounds*.8,mid=a.center.map((e,k)=>(e+b.center[k])/2),raw=n.map(e=>e+gauss()*.08*shrink),l=Math.hypot(...raw),v=raw.map(e=>e/l);
        const off2=off+[0,1,2].reduce((t,k)=>t+mid[k]*(v[k]-n[k]),0)+gauss()*50*shrink,[c1,c2]=sides(v,off2);
        const a2=growStone(a,[c1],data.tune),b2=a2&&growStone(b,[c2],data.tune);
        if(b2&&weight(a2)+weight(b2)>weight(a)+weight(b)){a=a2;b=b2;n=v;off=off2}
      }
      out.push({i:p.i,n,off,a,b,w:weight(a)+weight(b)});
    }
  }else if(data.step==='finish'){
    // Every original inclusion point, then prices: full size or held below the blocked sizes, whichever earns more.
    points=data.allInclusions;sizes=data.allSizes;PROFIT=data.profit;
    for(const p of data.pairs){
      const [ca,cb]=sides(p.n,p.off),done=[[p.a,ca],[p.b,cb]].map(([st,c])=>{
        const o={...st,D:st.full||st.D};
        while(o.D>MIN_D&&!fits(o.center,o.axis,o.D,o.cut,[c]))o.D-=4;
        o.full=o.D;o.D=sized(o.D,o.cut);
        // Check: inside the rough, on its own side of the saw and clear of every inclusion, at the final size.
        o.valid=o.D>MIN_D&&fits(o.center,o.axis,o.D,o.cut,[c]);
        if(!o.valid){
          // Recorded only: with no inclusion points the same check tells rough or saw apart from inclusions.
          const keep=points;points=new Float32Array(0);
          o.failed=o.D<=MIN_D?'too small after the final check':fits(o.center,o.axis,o.D,o.cut,[c])?'inclusion':'rough outline or saw';
          points=keep;
        }
        return o;
      });
      out.push({i:p.i,n:p.n,off:p.off,a:done[0],b:done[1],valid:done[0].valid&&done[1].valid,w:weight({...done[0],D:done[0].full})+weight({...done[1],D:done[1].full}),t:score(done[0])+score(done[1])});
    }
  }
  postMessage({sweep:out,fits:DIAG.fits});
}
onmessage=({data})=>{
  if(data.mode==='sawSweep'){DIAG={fits:0};sweepTask(data);return}
  if(data.mode==='single'){
    DIAG={fits:0};CUTS=data.cuts;SAW=data.sawWidth;SAFETY=data.safety||0;ROUGH_SAFETY=data.roughSafety||0;PROFIT=null;
    TABLE_BLOCK=data.autoTable?1:0;CULET_BLOCK=data.autoCulet?1:0;TABLE_T=data.tableDepth/100;CULET_T=data.culetStart/100;BOTTOM_T=1-(data.culetBottom??10)/100;
    buildMask(data.verts,data.tris);points=data.inclusions;sizes=data.sizes;seed=12345;
    singleTask(data);return;
  }
  const {verts,tris,inclusions,allInclusions,count,cuts,sawWidth}=data;
  CUTS=cuts;SAW=sawWidth;SAFETY=data.safety||0;ROUGH_SAFETY=data.roughSafety||0;
  // The search works by polished weight, as Advisor's does: judged by profit, a stone between 1.25 and about 1.45 mm
  // earns less than one held at 1.25, so the search could not climb to bigger stones. Prices choose between finished plans.
  const prices=data.profit||null;PROFIT=WEIGHT_SEARCH?null:prices;
  DIAG={fits:0,started:Date.now()};
  const saws=data.fixedSaws||[];
  TABLE_BLOCK=data.autoTable?1:0;CULET_BLOCK=data.autoCulet?1:0;TABLE_T=data.tableDepth/100;CULET_T=data.culetStart/100;BOTTOM_T=1-(data.culetBottom??10)/100;
  buildMask(verts,tris);points=inclusions;sizes=data.sizes;
  work=Math.max(1,(count-1)*PLANES*BEAM*(count+1)/2);done=0;
  let regions=[];
  if(data.fixedSaws){
    regions=[{cuts:[]}];
    for(const saw of saws){
      const key=JSON.stringify(saw.within),from=regions.find(r=>JSON.stringify(r.cuts)===key);
      if(!from)continue;
      regions=regions.filter(r=>r!==from);
      regions.push({cuts:[...from.cuts,[saw.normal[0],saw.normal[1],saw.normal[2],saw.offset+SAW/2]]});
      regions.push({cuts:[...from.cuts,[-saw.normal[0],-saw.normal[1],-saw.normal[2],-saw.offset+SAW/2]]});
    }
    regions.forEach(r=>{r.stone=bestStone(900,r.cuts)});
    regions=regions.filter(r=>r.stone);
    if(!regions.length){postMessage({stones:[],saws,diag:{...DIAG,end:'no stone fits beside the fixed saws'}});return}
  }else{
    regions=[{cuts:[],stone:bestStone(count===1?5000:1500,[])}];
    if(!regions[0].stone){postMessage({stones:[],diag:{...DIAG,end:'no stone fits in the rough'}});return}
  }
  let extra=[],top0='saw first';
  if(!data.fixedSaws){
    // Beam search: keeps the BEAM best partial plans at each level instead of only the single best.
    const sum=rs=>rs.reduce((t,r)=>t+score(r.stone),0);
    const root=regions[0];
    let beam=[{regions,saws:[]}];
    for(let level=1;level<count;level++){
      const next=[];
      for(const plan of beam){
        for(const r of plan.regions){
          const options=trySplit(r,count>3?70:110),others=sum(plan.regions.filter(x=>x!==r));
          for(const sp of options){
            const cutA=[sp.n[0],sp.n[1],sp.n[2],sp.off+SAW/2],cutB=[-sp.n[0],-sp.n[1],-sp.n[2],-sp.off+SAW/2];
            next.push({score:others+sp.total,
              regions:[...plan.regions.filter(x=>x!==r),{cuts:[...r.cuts,cutA],stone:sp.a},{cuts:[...r.cuts,cutB],stone:sp.b}],
              saws:[...plan.saws,{normal:sp.n,offset:sp.off,within:r.cuts,cutA,cutB}]});
          }
        }
      }
      if(!next.length)break;
      next.sort((p,q)=>q.score-p.score);
      beam=next.slice(0,BEAM);
      postMessage({partial:beam[0].regions.map(r=>r.stone),saws:beam[0].saws});
    }
    // Refine the leading plans and keep the best.
    let top=null;
    for(const plan of beam.slice(0,2)){
      const rs=plan.regions.map(r=>({...r})),ss=plan.saws.map(w=>({...w}));
      if(ss.length)refineSaws(rs,ss);
      const t=sum(rs);
      if(!top||t>top.t)top={t,rs,ss};
    }
    if(count===3){
      const three=tripletSearch(root),pie=USE_PIE?pieSearch(root):null;
      if(three)three.kind='saw first, 3 stones';
      if(pie)pie.kind='pie';
      const starts=[top,three].filter(p=>p&&p.rs.length===3).map(p=>p.rs.map(r=>({...r.stone})));
      const pairs=pairSearch(root),free=stonesFirst(root,starts,3,pairs);
      if(free)free.kind='stones first';
      extra=[three,pie,free].filter(Boolean);
      if(!top&&extra.length)top=extra.shift();
    }else if(count===2){
      const free=stonesFirst(root,top&&top.rs.length===2?[top.rs.map(r=>({...r.stone}))]:[],2);
      if(free){free.kind='stones first';extra=[free]}
      extra.push(...pairSearch(root));
      if(!top&&extra.length)top=extra.shift();
    }
    regions=top.rs;saws.length=0;saws.push(...top.ss);top0=top.kind||'saw first';
  }
  // Each plan is finished against every original point before plans are compared, because that step can shrink stones.
  PROFIT=prices;
  const dropped=[];
  const finishPlan=rs=>{
    points=inclusions;sizes=data.sizes;
    // Each stone found by weight is priced at its full size or held below the blocked sizes, whichever earns more.
    const out=rs.map(r=>({...r,stone:{...r.stone,D:sized(r.stone.full||r.stone.D,r.stone.cut)}}));
    for(const r of out){
      const better=bestStone(1200,r.cuts);
      if(better&&score(better)>score(r.stone))r.stone=better;
    }
    // The search used merged points; the final answer must be clear of every original point.
    points=allInclusions;sizes=data.allSizes;
    for(const r of out){
      const was=r.stone.D;
      if(FINISH_CLIMB){
        // Each stone climbs inside its part (saw faces included) against every inclusion point, by weight, from its full
        // size; then it is priced: full size or held below the blocked sizes, whichever earns more.
        let st={...r.stone,D:r.stone.full||r.stone.D};
        while(st.D>MIN_D&&!fits(st.center,st.axis,st.D,st.cut,r.cuts))st.D-=4;
        st.full=st.D;
        if(st.D>MIN_D){const up=climb(st,r.cuts,FINISH_CLIMB);if(weight(up)>weight(st))st=up}
        st.full=st.D;st.D=sized(st.D,st.cut);
        r.stone=st;
        continue;
      }
      while(r.stone.D>MIN_D&&!fits(r.stone.center,r.stone.axis,r.stone.D,r.stone.cut,r.cuts))r.stone.D-=4;
      r.stone.D=sized(r.stone.D,r.stone.cut);
      r.stone.full=r.stone.D;
      if(r.stone.D<was)r.stone=tuneStone(r.stone,r.cuts,FINISH_TUNE);
    }
    // A stone that cannot pay for its labour is left out of a profit plan.
    const kept=out.filter(r=>r.stone.D>MIN_D&&(!PROFIT||score(r.stone)>0)).map(r=>r.stone);
    return{kept,regions:out.filter(r=>kept.includes(r.stone)),total:kept.reduce((t,o)=>t+score(o),0),lost:out.filter(r=>!kept.includes(r.stone)).map(r=>r.stone)};
  };
  const brief=o=>({D:Math.round(o.D),full:Math.round(o.full||o.D),ct:+(o.cut.k*((o.full||o.D)/1000)**3).toFixed(5),center:o.center.map(v=>Math.round(v)),axis:o.axis.map(v=>+v.toFixed(4)),table:o.cut.name});
  DIAG.fitsSearch=DIAG.fits;
  DIAG.candidates=[{kind:top0,rs:regions},...extra.map(p=>({kind:p.kind||'extra',rs:p.rs}))].map(p=>({kind:p.kind,stones:p.rs.map(r=>brief(r.stone)),weight:+p.rs.reduce((t,r)=>t+r.stone.cut.k*((r.stone.full||r.stone.D)/1000)**3,0).toFixed(5)}));
  let done1=finishPlan(regions),sawsOut=saws,kind=top0;
  DIAG.priced=[{kind:top0,total:Math.round(done1.total)}];
  for(const plan of extra){
    const other=finishPlan(plan.rs);
    DIAG.priced.push({kind:plan.kind||'extra',total:Math.round(other.total),stones:other.kept.map(o=>Math.round(o.D))});
    if(other.total>done1.total*(plan.ss.length>sawsOut.length?PLATE_MARGIN:1)){done1=other;sawsOut=plan.ss;kind=plan.kind}
  }
  // A pie's plates meet around the wrapped stone and the saw stops at them. With a stone left out, one saw is enough.
  if(sawsOut.some(w=>w.pie)){
    const chain=sawsOut.filter(w=>w.pie),inner=done1.regions.find(r=>chain.every(w=>r.cuts.includes(w.cutA)||r.cuts.includes(w.cutB)));
    if(done1.regions.length<3||!inner){
      sawsOut=sawsOut.filter(w=>done1.regions.some(r=>r.cuts.includes(w.cutA))&&done1.regions.some(r=>r.cuts.includes(w.cutB))).slice(0,1).map(w=>({...w,pie:false}));
    }else{
      const wedge=chain.map(w=>{
        const k=inner.cuts.includes(w.cutA)?1:-1;
        return[w.normal[0]*k,w.normal[1]*k,w.normal[2]*k,w.offset*k];
      });
      const saws=sawsOut.filter(w=>!w.pie);
      chain.forEach((w,i)=>{w.stops=wedge.filter((_,k)=>k!==i);w.around=inner.cuts.includes(w.cutA)?1:-1;w.cross=saws});
      for(const w of saws)w.avoid=wedge;
    }
  }else if(!data.fixedSaws&&done1.lost.length){
    const on=(o,c)=>o.center[0]*c[0]+o.center[1]*c[1]+o.center[2]*c[2]>=c[3];
    const gone=[];
    sawsOut=sawsOut.filter(w=>{
      const here=done1.kept.filter(o=>w.within.every(c=>on(o,c))),a=here.filter(o=>on(o,w.cutA)),b=here.filter(o=>on(o,w.cutB));
      if(a.length&&b.length)return true;
      gone.push(w.cutA,w.cutB);
      return false;
    });
    for(const w of sawsOut)w.within=w.within.filter(c=>!gone.includes(c));
  }
  DIAG.end='all search stages finished';DIAG.chosen=kind;DIAG.seconds=Math.round((Date.now()-DIAG.started)/1000);
  postMessage({stones:done1.kept,saws:sawsOut,lost:done1.lost,kind,diag:DIAG});
};
}
