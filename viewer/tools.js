// Edit saw, Split inclusion, picking inclusions and the scan image view.
'use strict';
// Edit saw and Split inclusion both take over the mouse on the stone view.
let tool=null,editSaw=false,splitMode=false,activeSaw=0,sawQueued=false;
function setTool(name){
  editSaw=name==='saw'&&!editSaw;
  splitMode=name==='split'&&!splitMode;
  if(editSaw||splitMode)setPickMode(false);
  if(editSaw||splitMode)showOnly(null);
  $('editSaw').setAttribute('aria-pressed',editSaw);
  $('splitInc').setAttribute('aria-pressed',splitMode);
  $('stage').classList.toggle('tooling',editSaw||splitMode);
  const s=stones[current];
  if(editSaw&&s)prepareSaw(s);
  if(editSaw)$('fitInfo').textContent='Left-drag rotates the saw. Right-drag moves it. Click to change saw.';
  if(splitMode)$('fitInfo').textContent='Drag a line across an inclusion to split it.';
}
function prepareSaw(s){
  const W=gl.canvas.width,H=gl.canvas.height,v=currentMap(s,W,H);
  if(!s.ownPlan){
    const width=sawSetting(s);
    s.ownPlan=s.plannedStones.map(r=>({...r,center:[...r.center],angles:[...r.angles]}));
    s.ownSawWidth=width;
    s.ownSaws=s.plannedStones.length>1&&s.sawOffset?[{normal:[...s.sawNormal],offset:s.sawOffset-(s.fileSawWidth||0)/2,within:[]}]:[];
  }
  if(!s.ownSaws.length&&v){
    const bb=bbox(s.stone),c=bb.lo.map((x,i)=>(x+bb.hi[i])/2),n=unit(v.M[1]);
    s.ownSaws=[{normal:n,offset:c[0]*n[0]+c[1]*n[1]+c[2]*n[2],within:[]}];
  }
  activeSaw=Math.min(activeSaw,Math.max(0,s.ownSaws.length-1));
  uploadPlan(s);render();renderDetails(s);
}
function turnAbout(v,k,a){
  const c=Math.cos(a),n=Math.sin(a),x=cross(k,v),d=k[0]*v[0]+k[1]*v[1]+k[2]*v[2];
  return v.map((e,i)=>e*c+x[i]*n+k[i]*d*(1-c));
}
// Later saws remember the side of this saw they sit on, so they follow it when it moves.
function moveSaw(s,saw,normal,offset){
  const W=s.ownSawWidth,old=saw.normal,was=saw.offset;
  for(const other of s.ownSaws){
    other.within=other.within.map(c=>{
      const same=c[0]*old[0]+c[1]*old[1]+c[2]*old[2];
      if(same>.999999&&Math.abs(c[3]-(was+W/2))<1e-3)return[...normal,offset+W/2];
      if(same<-.999999&&Math.abs(c[3]-(-was+W/2))<1e-3)return[...normal.map(e=>-e),-offset+W/2];
      return c;
    });
  }
  saw.normal=normal;saw.offset=offset;
}
function sawDrag(s,t,dx,dy){
  const saw=s.ownSaws[activeSaw];if(!saw)return;
  const v=currentMap(s,gl.canvas.width,gl.canvas.height),r=gl.canvas.width/gl.canvas.clientWidth,W=gl.canvas.width,H=gl.canvas.height;
  let n=saw.normal,off=saw.offset;
  if(t.button===2){
    const mx=dx*r*2/W/v.sx,my=-dy*r*2/H/v.sy,step=v.M[0].map((e,i)=>e*mx+v.M[1][i]*my);
    off+=step[0]*n[0]+step[1]*n[1]+step[2]*n[2];
  }else{
    const bb=bbox(s.stone),c=bb.lo.map((x,i)=>(x+bb.hi[i])/2),h=c[0]*n[0]+c[1]*n[1]+c[2]*n[2]-off,pivot=c.map((e,i)=>e-n[i]*h);
    n=unit(turnAbout(turnAbout(n,v.M[1],dx*SAW_TURN),v.M[0],dy*SAW_TURN));
    off=pivot[0]*n[0]+pivot[1]*n[1]+pivot[2]*n[2];
  }
  moveSaw(s,saw,n,off);
  if(sawQueued)return;
  sawQueued=true;
  requestAnimationFrame(()=>{sawQueued=false;uploadSaw(s);render()});
}
function drawSplitLine(t){
  const line=$('splitLine').firstElementChild,box=$('stage').getBoundingClientRect();
  line.setAttribute('x1',t.x0-box.left);line.setAttribute('y1',t.y0-box.top);
  line.setAttribute('x2',t.x-box.left);line.setAttribute('y2',t.y-box.top);
}
function finishSplit(s,t){
  $('splitLine').classList.remove('on');
  const el=$('stage'),box=el.getBoundingClientRect(),r=gl.canvas.width/box.width;
  if(Math.hypot(t.x-t.x0,t.y-t.y0)<6)return;
  const W=gl.canvas.width,H=gl.canvas.height,v=currentMap(s,W,H),px=x=>(x-box.left)*r,py=y=>(y-box.top)*r;
  const hit=inclusionAt(s,px((t.x+t.x0)/2),py((t.y+t.y0)/2));
  if(!hit){$('fitInfo').textContent='No inclusion under the middle of that line.';return}
  const model=(x,y)=>[((px(x)*2/W-1)-v.ox)/v.sx,((1-py(y)*2/H)-v.oy)/v.sy],A=model(t.x0,t.y0),B=model(t.x,t.y);
  const a=B[1]-A[1],b=A[0]-B[0],l=Math.hypot(a,b),pa=a/l,pb=b/l,normal=v.M[0].map((e,i)=>e*pa+v.M[1][i]*pb);
  const offset=normal[0]*v.c[0]+normal[1]*v.c[1]+normal[2]*v.c[2]+pa*A[0]+pb*A[1];
  const cut={id:hit.id,normal,offset};
  s.splits=s.splits||[];s.fullInclusions=s.fullInclusions||s.inclusions;
  if(!splitInclusion(s,cut,s.splits.length)){$('fitInfo').textContent='That line does not cross the inclusion.';return}
  s.splits.push(cut);
  picksChanged(s);
  $('fitInfo').textContent='Split: one part is selected and one ignored. Use Pick inclusions to swap them.';
}
function toolDown(e,el){
  if(!editSaw&&!splitMode)return false;
  const s=stones[current];if(!s)return true;
  el.setPointerCapture(e.pointerId);
  if(editSaw&&!s.ownSaws?.length)prepareSaw(s);
  if(editSaw)tool={kind:'saw',button:e.button,x:e.clientX,y:e.clientY,moved:0};
  else if(e.button===0){
    tool={kind:'split',x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY};
    drawSplitLine(tool);$('splitLine').classList.add('on');
  }
  return true;
}
function toolMove(e){
  if(!tool)return editSaw||splitMode;
  const s=stones[current],dx=e.clientX-tool.x,dy=e.clientY-tool.y;
  tool.x=e.clientX;tool.y=e.clientY;
  if(tool.kind==='saw'){tool.moved+=Math.abs(dx)+Math.abs(dy);sawDrag(s,tool,dx,dy)}
  else drawSplitLine(tool);
  return true;
}
function toolUp(){
  if(!tool)return editSaw||splitMode;
  const s=stones[current],t=tool;tool=null;
  if(t.kind==='split')finishSplit(s,t);
  else if(t.moved<4&&s.ownSaws.length>1){
    activeSaw=(activeSaw+1)%s.ownSaws.length;
    $('fitInfo').textContent=`Saw ${activeSaw+1} of ${s.ownSaws.length} selected.`;
  }else if(t.moved>=4){
    uploadSaw(s);render();
    fitStones(s.ownSaws.length+1,s.ownSaws);
  }
  return true;
}
function toggleDiamond(){
  diamondHidden=!diamondHidden;
  const b=$('hideDiamond');
  b.textContent=diamondHidden?'Show diamond':'Hide diamond';
  b.setAttribute('aria-pressed',diamondHidden);
  render();
  queueInset();
}
function toggleInclusions(){
  $('showInc').checked=!$('showInc').checked;
  render();
  queueInset();
}
// Damaged frames hold a band of data from elsewhere. The stone turns only 1.2 degrees per frame, so
// a good frame nearly matches a neighbour; a damaged one has a run of rows that matches none of them.
const SEAM_ROWS=6,SEAM_LEVEL=9,THUMB_W=96,THUMB_H=120;
const seamCanvas=document.createElement('canvas');seamCanvas.width=THUMB_W;seamCanvas.height=THUMB_H;
const seamCtx=seamCanvas.getContext('2d',{willReadFrequently:true});
function frameThumb(s,f){
  return f.thumb=f.thumb||(async()=>{
    const b=await createImageBitmap(s.file.slice(f.s,f.e,'image/jpeg'));
    seamCtx.drawImage(b,0,0,THUMB_W,THUMB_H);b.close();
    const d=seamCtx.getImageData(0,0,THUMB_W,THUMB_H).data,a=new Float32Array(THUMB_W*THUMB_H);
    for(let i=0;i<a.length;i++)a[i]=d[i*4];
    return a;
  })().catch(()=>null);
}
function changedRows(a,b){
  if(!a||!b)return THUMB_H;
  let run=0,most=0;const row=new Float32Array(THUMB_W);
  for(let y=0;y<THUMB_H;y++){
    for(let x=0;x<THUMB_W;x++)row[x]=Math.abs(a[y*THUMB_W+x]-b[y*THUMB_W+x]);
    run=row.sort()[THUMB_W>>1]>SEAM_LEVEL?run+1:0;
    most=Math.max(most,run);
  }
  return most;
}
async function checkFrame(s,f){
  if(f.seam!==undefined)return f.seam;
  const n=s.frames.length,me=await frameThumb(s,f);
  if(!me)return f.seam=true;
  const near=await Promise.all([-2,-1,1,2].map(k=>frameThumb(s,s.frames[(f.index+k+n)%n])));
  return f.seam=Math.min(...near.map(t=>changedRows(me,t)))>=SEAM_ROWS;
}
function turnView(dx,dy){
  if(rotMode==='horizontal'){
    const s=stones[current];
    if(s&&s.pose){
      const want=(cam.scanAngle||0)-dx,base=((Math.round(want/(2*Math.PI/300))%300)+300)%300;
      setScanView(s,want);
      if(base!==frameAt)goToFrame(base,dx<0?1:-1);
      return;
    }
    const c=Math.cos(dx),n=Math.sin(dx);
    cam.M=cam.M.map(r=>[r[0]*c+r[1]*n,-r[0]*n+r[1]*c,r[2]]);
    return;
  }
  const cy=Math.cos(dx),sy=Math.sin(dx),cp=Math.cos(dy),sp=Math.sin(dy),m=cam.M;
  const r0=m[0].map((v,i)=>cy*v+sy*m[2][i]),r2=m[0].map((v,i)=>-sy*v+cy*m[2][i]);
  cam.M=[r0,m[1].map((v,i)=>cp*v-sp*r2[i]),m[1].map((v,i)=>sp*v+cp*r2[i])];
}
function bindDraw(buf,n,col,glass,mode=gl.TRIANGLES){
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  const p=gl.getAttribLocation(program,'p'),a=gl.getAttribLocation(program,'n');
  gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(p,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,12);
  gl.uniform3fv(gl.getUniformLocation(program,'col'),col);
  gl.uniform1f(gl.getUniformLocation(program,'glass'),glass);
  gl.drawArrays(mode,0,n);
}
function sizeCanvas(){
  const c=gl.canvas,r=Math.min(devicePixelRatio||1,2),W=c.clientWidth*r|0,H=c.clientHeight*r|0;
  if(c.width!==W||c.height!==H){c.width=W;c.height=H}
  gl.viewport(0,0,W,H);
  return[W,H];
}
function drawModel(W,H){
  gl.depthMask(true);gl.clearColor(.87,.87,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(!drawn.stone)return;
  const k=cam.scale*cam.zoom;
  gl.uniformMatrix3fv(gl.getUniformLocation(program,'R'),false,rotation());
  gl.uniform3fv(gl.getUniformLocation(program,'c'),cam.center);
  gl.uniform2f(gl.getUniformLocation(program,'s'),k*H/W,k);
  gl.uniform2f(gl.getUniformLocation(program,'o'),cam.panX,cam.panY);
  gl.uniform1f(gl.getUniformLocation(program,'d'),k*.5);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);
  if($('showInc').checked)drawn.inc.forEach(p=>{if(p.state!=='ignored'||$('showIgnored').checked)bindDraw(p.buf,p.n,INC_COLORS[p.color||p.state],0)});
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  if(diamondHidden)return;
  const single=onlyStone!==null||polishView;
  if(single||$('showPlan').checked)drawn.plan.forEach((p,i)=>{
    if(onlyStone!==null&&i!==onlyStone)return;
    // Clear like glass when showing inclusions, because a solid stone would hide them.
    const clear=single&&($('showInc').checked||projView);
    if(projView){
      // Far facet lines faint, near ones (the pavilion, facing us) strong: the faces only fill the depth buffer.
      const col=PLAN_COLORS[i%3],faint=col.map(v=>v*.35+.87*.65);
      gl.disable(gl.DEPTH_TEST);bindDraw(p.lines,p.ln,faint,0,gl.LINES);gl.enable(gl.DEPTH_TEST);
      gl.colorMask(false,false,false,false);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(2,2);
      bindDraw(p.buf,p.n,col,0);gl.disable(gl.POLYGON_OFFSET_FILL);gl.colorMask(true,true,true,true);
      bindDraw(p.lines,p.ln,col,0,gl.LINES);return;
    }
    if(clear)gl.depthMask(false);
    bindDraw(p.buf,p.n,PLAN_COLORS[i%3],clear?1:2);
    gl.depthMask(true);
    bindDraw(p.lines,p.ln,[.03,.03,.05],0,gl.LINES);
  });
  if(single&&drawn.near){gl.disable(gl.DEPTH_TEST);bindDraw(drawn.near,drawn.nearN,[1,.55,0],0,gl.LINES);gl.enable(gl.DEPTH_TEST)}
  if(single&&drawn.outside){gl.disable(gl.DEPTH_TEST);bindDraw(drawn.outsideFill,drawn.outsideFillN,[.12,.12,.12],0);bindDraw(drawn.outside,drawn.outsideN,[0,0,0],0,gl.LINES);gl.enable(gl.DEPTH_TEST)}
  if(single)return;
  if($('showStone').checked){
    gl.depthMask(false);
    // With saws, each part of the rough takes its stone's colour, as in Advisor.
    if(drawn.parts?.length)drawn.parts.forEach(p=>bindDraw(p.buf,p.n,PLAN_COLORS[p.i%3],1));
    else bindDraw(drawn.stone,drawn.stoneN,[.58,.52,.72],1);
  }
  // The saw is drawn last and over everything, so the glass stone never hides it.
  if(drawn.saw){
    gl.depthMask(false);
    drawn.sawFill.forEach(p=>bindDraw(p.buf,p.n,PLAN_COLORS[p.i%3],2));
    gl.disable(gl.DEPTH_TEST);
    if(drawn.sawBand)bindDraw(drawn.sawBand.buf,drawn.sawBand.n,[1,.9,.05],3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }
}
// The scan view shows frame point (x, y) at the middle of the stage, at this zoom.
const scanView={zoom:1,x:512,y:640};
const SCAN_ZOOM_MAX=12;
function scanFit(W,H){return Math.min(W/1024,H/1280)*scanView.zoom}
function resetScanView(){scanView.zoom=1;scanView.x=512;scanView.y=640}
function paintPhoto(W,H){
  const c=$('photo');
  if(c.width!==W||c.height!==H){c.width=W;c.height=H}
  const g=c.getContext('2d'),fit=scanFit(W,H);
  g.setTransform(1,0,0,1,0,0);g.fillStyle='#000';g.fillRect(0,0,W,H);
  if(!shownPhoto)return;
  g.imageSmoothingQuality='high';
  // Advisor shows frames upside down, with the holder at the top.
  g.setTransform(fit,0,0,-fit,W/2-scanView.x*fit,H/2+scanView.y*fit);
  try{g.drawImage(shownPhoto,0,0)}catch{shownPhoto=null}
}
function stoneInFrame(s,f){
  const bb=bbox(s.stone),p=bb.lo.map((v,i)=>(v+bb.hi[i])/2),{R,T,span,scale:K}=s.pose,th=f.index*2*Math.PI/300;
  const q=R.map((r,i)=>r[0]*p[0]+r[1]*p[1]+r[2]*p[2]+T[i]);
  return[512+K*(-q[1]*Math.cos(th)+q[0]*Math.sin(th)),K*(q[2]+span)];
}
function setScanZoom(zoom,atX,atY){
  const c=gl.canvas,W=c.width,H=c.height,old=scanFit(W,H),px=atX??W/2,py=atY??H/2;
  const u=scanView.x+(px-W/2)/old,v=scanView.y-(py-H/2)/old;
  scanView.zoom=Math.min(SCAN_ZOOM_MAX,Math.max(1,zoom));
  if(scanView.zoom===1){resetScanView();render();return}
  const fit=scanFit(W,H);
  scanView.x=Math.min(1024,Math.max(0,u-(px-W/2)/fit));
  scanView.y=Math.min(1280,Math.max(0,v+(py-H/2)/fit));
  render();
}
function zoomButton(factor){
  if(!scanMode){cam.zoom=Math.min(12,Math.max(.4,cam.zoom*factor));render();return}
  const s=stones[current],f=s&&s.frames[frameAt];
  if(scanView.zoom===1&&f&&s.pose&&s.stone)[scanView.x,scanView.y]=stoneInFrame(s,f);
  setScanZoom(scanView.zoom*factor);
}
// Over the photo: model point to frame pixel, u = 512 + K (a cos + b sin) and v = K (height + span).
function scanMap(s,f,W,H){
  const {R,T,span,scale:K}=s.pose,th=f.index*2*Math.PI/300,cs=Math.cos(th),sn=Math.sin(th);
  const A=R[1].map(v=>-v),B=R[0],across=A.map((v,i)=>cs*v+sn*B[i]),depth=A.map((v,i)=>-sn*v+cs*B[i]);
  const fit=scanFit(W,H),sx=2*fit/W,sy=2*fit/H;
  return{M:[across,R[2],depth],c:[0,0,0],sx:K*sx,sy:K*sy,
    ox:K*sx*(-T[1]*cs+T[0]*sn)+sx*(512-scanView.x),oy:K*sy*(T[2]+span)-scanView.y*sy};
}
function currentMap(s,W,H){
  if(scanMode){const f=s.frames[frameAt];return f&&s.pose?scanMap(s,f,W,H):null}
  const k=cam.scale*cam.zoom;
  return{M:cam.M,c:cam.center,sx:k*H/W,sy:k,ox:cam.panX,oy:cam.panY};
}
// Finds the front-most inclusion under a point on the stage, in canvas pixels.
function inclusionAt(s,px,py){
  const c=gl.canvas,W=c.width,H=c.height,v=currentMap(s,W,H);
  if(!v||!$('showInc').checked)return null;
  const [m0,m1,m2]=v.M,[cx,cy,cz]=v.c,tx=px*2/W-1,ty=1-py*2/H,near=2*NEAR_PIXELS/W;
  let best=null,top=-Infinity,close=null,gap=near;
  for(const inc of s.inclusions){
    if(inc.ignored&&!$('showIgnored').checked)continue;
    if(insideOnly&&!insideOnly.has(inc))continue;
    const p=inc.mesh.pos,t=inc.mesh.tris,n=p.length/3,X=new Float32Array(n),Y=new Float32Array(n),Z=new Float32Array(n);
    for(let i=0;i<n;i++){
      const a=p[i*3]-cx,b=p[i*3+1]-cy,d=p[i*3+2]-cz;
      X[i]=(m0[0]*a+m0[1]*b+m0[2]*d)*v.sx+v.ox;
      Y[i]=(m1[0]*a+m1[1]*b+m1[2]*d)*v.sy+v.oy;
      Z[i]=m2[0]*a+m2[1]*b+m2[2]*d;
    }
    for(let i=0;i<t.length;i+=3){
      const a=t[i],b=t[i+1],e=t[i+2];
      for(const v of [a,b,e]){
        const g=Math.hypot(X[v]-tx,(Y[v]-ty)*H/W);
        if(g<gap){gap=g;close=inc}
      }
      const d=(Y[b]-Y[e])*(X[a]-X[e])+(X[e]-X[b])*(Y[a]-Y[e]);
      if(Math.abs(d)<1e-12)continue;
      const u=((Y[b]-Y[e])*(tx-X[e])+(X[e]-X[b])*(ty-Y[e]))/d,w=((Y[e]-Y[a])*(tx-X[e])+(X[a]-X[e])*(ty-Y[e]))/d;
      if(u<0||w<0||u+w>1)continue;
      const z=u*Z[a]+w*Z[b]+(1-u-w)*Z[e];
      if(z>top){top=z;best=inc}
    }
  }
  return best||close;
}
function inclusionKey(s){return`adv-picks:${s.name}:${s.file.size}`}
function rememberPicks(s){
  const ids=[...new Set(s.inclusions.filter(i=>i.ignored).map(i=>i.id))],auto=[...new Set(s.inclusions.filter(i=>i.auto&&!i.ignored).map(i=>i.id))];
  try{localStorage.setItem(inclusionKey(s),JSON.stringify({ids,auto,splits:s.splits||[]}))}catch{}
}
function restorePicks(s){
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(inclusionKey(s)))}catch{}
  if(!saved)return false;
  const ids=Array.isArray(saved)?saved:saved.ids;
  if(!Array.isArray(ids))return false;
  replaySplits(s,Array.isArray(saved.splits)?saved.splits:[]);
  const set=new Set(ids),auto=Array.isArray(saved.auto)?new Set(saved.auto):null;
  // Older saves hold only the ignored ones; their Auto marks stay as Auto select set them.
  for(const i of s.inclusions){i.ignored=set.has(i.id);if(auto)i.auto=auto.has(i.id)&&!i.ignored}
  return true;
}
// Points on the rough's surface, grouped into cells so a nearby point is quick to find.
function surfaceCells(s){
  if(s.surface)return s.surface;
  const P=s.stone.pos,T=s.stone.tris,cells=new Map;
  const add=(x,y,z)=>{
    const key=Math.floor(x/SURFACE_CELL)+','+Math.floor(y/SURFACE_CELL)+','+Math.floor(z/SURFACE_CELL);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(x,y,z);
  };
  for(let i=0;i<T.length;i+=3){
    const [a,b,c]=[T[i]*3,T[i+1]*3,T[i+2]*3];
    const long=Math.max(Math.hypot(P[a]-P[b],P[a+1]-P[b+1],P[a+2]-P[b+2]),Math.hypot(P[a]-P[c],P[a+1]-P[c+1],P[a+2]-P[c+2]),Math.hypot(P[b]-P[c],P[b+1]-P[c+1],P[b+2]-P[c+2]));
    const n=Math.max(1,Math.ceil(long/SURFACE_STEP));
    for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){
      const e=u/n,f=v/n,g=1-e-f;
      add(P[a]*e+P[b]*f+P[c]*g,P[a+1]*e+P[b+1]*f+P[c+1]*g,P[a+2]*e+P[b+2]*f+P[c+2]*g);
    }
  }
  return s.surface=cells;
}
function nearSurface(cells,x,y,z,reach){
  const r=Math.ceil(reach/SURFACE_CELL),cx=Math.floor(x/SURFACE_CELL),cy=Math.floor(y/SURFACE_CELL),cz=Math.floor(z/SURFACE_CELL),limit=reach*reach;
  for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++)for(let k=-r;k<=r;k++){
    const list=cells.get(`${cx+i},${cy+j},${cz+k}`);
    if(!list)continue;
    for(let q=0;q<list.length;q+=3){
      const a=list[q]-x,b=list[q+1]-y,c=list[q+2]-z;
      if(a*a+b*b+c*c<=limit)return true;
    }
  }
  return false;
}
// The steps the planner does by hand in Advisor: every inclusion starts as Use, small sizes become
// Ignore, then a middle band becomes Auto, then anything wholly in the skin of the rough goes back
// to Use. Drop pin marks at the top and bottom are always ignored. Advisor's size is the longest
// side of the inclusion's box. Together these match 96% of three stones planned this way.
function autoPicks(s){
  const up=s.pose?s.pose.R[2]:[0,0,1],height=(p,v)=>up[0]*p[v*3]+up[1]*p[v*3+1]+up[2]*p[v*3+2];
  const m=s.stone;let low=Infinity,high=-Infinity;
  if(m)for(const v of m.tris){const h=height(m.pos,v);if(h<low)low=h;if(h>high)high=h}
  const groups=new Map;
  for(const i of s.inclusions){
    if(!groups.has(i.id))groups.set(i.id,{list:[],lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity],a:Infinity,b:-Infinity});
    const g=groups.get(i.id),P=i.mesh.pos;g.list.push(i);
    for(const v of new Set(i.mesh.tris)){
      for(let k=0;k<3;k++){const c=P[v*3+k];if(c<g.lo[k])g.lo[k]=c;if(c>g.hi[k])g.hi[k]=c}
      const h=height(P,v);if(h<g.a)g.a=h;if(h>g.b)g.b=h;
    }
  }
  const zone=pinSetting()/100*(high-low),reach=PIN_REACH*(high-low),skin=skinSetting(),ignoreTo=ignoreToSetting(),autoFrom=autoFromSetting(),autoTo=autoToSetting(s);
  const cells=m&&skin>0?surfaceCells(s):null,count={pins:0,size:0,skin:0,auto:0,use:0};
  for(const g of groups.values()){
    // Size is the diagonal across the two longest box sides: on 195 Advisor stones it cuts Ignore at 201 and tops Auto at CrownInc.
    const sides=g.hi.map((v,k)=>v-g.lo[k]).sort((a,b)=>b-a),size=Math.hypot(sides[0],sides[1]);
    let mode=size<=ignoreTo?'ignore':'use';
    if(size>=autoFrom&&size<=autoTo)mode='auto';
    const pin=m&&((g.b>=high-zone&&g.a>=high-reach)||(g.a<=low+zone&&g.b<=low+reach));
    // Only an inclusion with no part deeper than the skin counts as being in the skin.
    const inSkin=cells&&g.list.every(i=>{
      const P=i.mesh.pos;
      for(const v of new Set(i.mesh.tris))if(!nearSurface(cells,P[v*3],P[v*3+1],P[v*3+2],skin))return false;
      return true;
    });
    // In the skin: Use. With the MIN-MICRON setting on, inclusions smaller than MIN-MICRON are ignored instead
    // (off by default: Advisor's saved marks keep tiny inclusions in the skin as Use).
    if(inSkin)mode=minMicronSetting()&&size<minMicron(s.rough)?'ignore':'use';
    const ignored=pin||mode==='ignore';
    for(const i of g.list){i.ignored=ignored;i.auto=mode==='auto'}
    if(pin)count.pins++;else if(inSkin)count.skin++;else count[mode==='ignore'?'size':mode]++;
  }
  return count;
}
// Cuts every mesh of one inclusion along a plane. The two parts become separate inclusions.
function splitInclusion(s,cut,index){
  const {id,normal:n,offset}=cut,parts=s.inclusions.filter(i=>i.id===id),a=[],b=[],idA=SPLIT_ID_BASE+index*2,idB=idA+1;
  for(const inc of parts){
    const t=inc.mesh.tris,pts=[...inc.mesh.pos],sideA=[],sideB=[];
    const gap=v=>pts[v*3]*n[0]+pts[v*3+1]*n[1]+pts[v*3+2]*n[2]-offset;
    const fan=(list,to)=>{for(let k=1;k<list.length-1;k++)to.push(list[0],list[k],list[k+1])};
    for(let k=0;k<t.length;k+=3){
      const tri=[t[k],t[k+1],t[k+2]],g=tri.map(gap);
      if(g.every(x=>x>=0)){sideA.push(...tri);continue}
      if(g.every(x=>x<=0)){sideB.push(...tri);continue}
      // Triangles crossing the line are cut exactly, because some pieces have only a few.
      const front=[],back=[];
      for(let e=0;e<3;e++){
        const f=(e+1)%3;
        if(g[e]>=0)front.push(tri[e]);
        if(g[e]<=0)back.push(tri[e]);
        if(g[e]*g[f]<0){
          const r=g[e]/(g[e]-g[f]),v=pts.length/3;
          for(let c=0;c<3;c++)pts.push(pts[tri[e]*3+c]+(pts[tri[f]*3+c]-pts[tri[e]*3+c])*r);
          front.push(v);back.push(v);
        }
      }
      fan(front,sideA);fan(back,sideB);
    }
    const pos=new inc.mesh.pos.constructor(pts);
    if(sideA.length)a.push({...inc,id:idA,split:true,mesh:{pos,tris:sideA}});
    if(sideB.length)b.push({...inc,id:idB,split:true,ignored:!inc.ignored,mesh:{pos,tris:sideB}});
  }
  if(!a.length||!b.length)return false;
  s.inclusions=[...s.inclusions.filter(i=>i.id!==id),...a,...b];
  return true;
}
function replaySplits(s,list){
  s.fullInclusions=s.fullInclusions||s.inclusions;
  s.inclusions=s.fullInclusions.map(i=>({...i}));
  s.splits=[];
  for(const cut of list)if(splitInclusion(s,cut,s.splits.length))s.splits.push(cut);
}
function pickCounts(s){
  const all=new Map(s.inclusions.map(i=>[i.id,i.ignored]));
  const ignored=[...all.values()].filter(Boolean).length;
  return[all.size-ignored,ignored];
}
function showPicks(){
  const s=stones[current];if(!s)return;
  const [on,off]=pickCounts(s);
  $('picked').textContent=`${on} selected · ${off} ignored`;
}
function picksChanged(s){
  uploadInclusions(s);rememberPicks(s);showPicks();render();queueInset();renderDetails(s);
}
function togglePick(s,hit){
  const ignored=!hit.ignored;
  // A click switches between Use and Ignore; an Auto inclusion becomes Ignore, and clicked again, Use.
  for(const i of s.inclusions)if(i.id===hit.id){i.ignored=ignored;i.auto=false}
  picksChanged(s);
}
function setAllPicks(ignored){
  const s=stones[current];if(!s)return;
  // Select all makes every inclusion Use and Ignore all makes every one Ignore, so no Auto mark is left over.
  for(const i of s.inclusions){i.ignored=ignored;i.auto=false}
  picksChanged(s);
}
function setPickMode(on){
  pickMode=on;
  $('pickMode').setAttribute('aria-pressed',on);
  if(on&&(editSaw||splitMode))setTool('');
  $('stage').classList.toggle('picking',on);
}
// A press that barely moves counts as a click, so dragging to rotate never changes a selection.
function clickedStage(el,e,startX,startY){
  if(Math.hypot(e.clientX-startX,e.clientY-startY)>4)return;
  const s=stones[current];if(!s)return;
  const box=el.getBoundingClientRect(),r=gl.canvas.width/box.width,px=(e.clientX-box.left)*r,py=(e.clientY-box.top)*r;
  if(!pickMode){
    const hit=stoneAt(s,px,py);
    showOnly(hit===onlyStone?null:hit);
    return;
  }
  const hit=inclusionAt(s,px,py);
  if(hit)togglePick(s,hit);
}
// Finds the front-most polished stone under a point on the stage, in canvas pixels.
function stoneAt(s,px,py){
  const W=gl.canvas.width,H=gl.canvas.height,v=currentMap(s,W,H);
  if(!v||(onlyStone===null&&!$('showPlan').checked))return null;
  const tx=px*2/W-1,ty=1-py*2/H,[m0,m1,m2]=v.M,[cx,cy,cz]=v.c;
  let best=null,top=-Infinity;
  activeStones(s).forEach((r,index)=>{
    if(onlyStone!==null&&index!==onlyStone)return;
    const p=r.mesh.pos,t=r.mesh.tris;
    const at=i=>{const a=p[i*3]-cx,b=p[i*3+1]-cy,d=p[i*3+2]-cz;return[(m0[0]*a+m0[1]*b+m0[2]*d)*v.sx+v.ox,(m1[0]*a+m1[1]*b+m1[2]*d)*v.sy+v.oy,m2[0]*a+m2[1]*b+m2[2]*d]};
    for(let i=0;i<t.length;i+=3){
      const A=at(t[i]),B=at(t[i+1]),C=at(t[i+2]),d=(B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1]);
      if(Math.abs(d)<1e-12)continue;
      const u=((B[1]-C[1])*(tx-C[0])+(C[0]-B[0])*(ty-C[1]))/d,w=((C[1]-A[1])*(tx-C[0])+(A[0]-C[0])*(ty-C[1]))/d;
      if(u<0||w<0||u+w>1)continue;
      const z=u*A[2]+w*B[2]+(1-u-w)*C[2];
      if(z>top){top=z;best=index}
    }
  });
  return best;
}
// One polished stone on its own. Inclusions stay off until Tab, and then only those inside it show.
function showOnly(index){
  const s=stones[current];
  if(index===onlyStone)return;
  if(onlyStone===null){
    beforeOnly={inc:$('showInc').checked,center:cam.center,panX:cam.panX,panY:cam.panY};
    $('showInc').checked=false;
  }
  if(index===null){
    $('showInc').checked=beforeOnly.inc;
    cam.center=beforeOnly.center;cam.panX=beforeOnly.panX;cam.panY=beforeOnly.panY;
    beforeOnly=null;insideOnly=null;
  }
  onlyStone=index;
  $('showAll').hidden=index===null;
  if(index!==null&&s){
    const r=activeStones(s)[index],bb=bbox(r.mesh);
    cam.center=bb.lo.map((v,k)=>(v+bb.hi[k])/2);cam.panX=cam.panY=0;
    $('showAll').textContent=`Show all (Stone ${String.fromCharCode(65+index)} only)`;
  }
  if(!s)return;
  uploadInclusions(s);renderDetails(s);render();queueInset();
}
function drawScan(W,H){
  gl.depthMask(true);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const s=stones[current],f=s&&s.frames[frameAt];
  if(!drawn.stone||!f||!s.pose)return;
  const v=scanMap(s,f,W,H),M=v.M;
  gl.uniformMatrix3fv(gl.getUniformLocation(program,'R'),false,new Float32Array([M[0][0],M[1][0],M[2][0],M[0][1],M[1][1],M[2][1],M[0][2],M[1][2],M[2][2]]));
  gl.uniform3f(gl.getUniformLocation(program,'c'),0,0,0);
  gl.uniform2f(gl.getUniformLocation(program,'s'),v.sx,v.sy);
  gl.uniform2f(gl.getUniformLocation(program,'o'),v.ox,v.oy);
  gl.uniform1f(gl.getUniformLocation(program,'d'),s.pose.scale/1280);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  if($('showInc').checked)drawn.inc.forEach(p=>{if(p.state!=='ignored'||$('showIgnored').checked)bindDraw(p.buf,p.n,INC_COLORS[p.color||p.state],0)});
  if(diamondHidden)return;
  const single=onlyStone!==null||polishView;
  if(single||$('showPlan').checked)drawn.plan.forEach((p,i)=>{if(onlyStone===null||i===onlyStone)bindDraw(p.lines,p.ln,PLAN_COLORS[i%3],3,gl.LINES)});
  if(single)return;
  if(drawn.saw)bindDraw(drawn.saw,drawn.sawN,[1,.89,.3],3,gl.LINES);
}
function render(){
  if(!gl||!gl.canvas.clientWidth)return;
  const [W,H]=sizeCanvas();
  if(scanMode){paintPhoto(W,H);drawScan(W,H)}else drawModel(W,H);
}
// The small 3D preview is redrawn after the view settles, so it never slows a drag.
function queueInset(){
  clearTimeout(insetTimer);
  insetTimer=setTimeout(()=>{
    if(!scanMode||!gl||!gl.canvas.clientWidth)return;
    const [W,H]=sizeCanvas(),box=$('inset').querySelector('canvas'),g=box.getContext('2d'),m=Math.min(W/box.width,H/box.height),w=box.width*m,h=box.height*m;
    drawModel(W,H);
    g.drawImage(gl.canvas,(W-w)/2,(H-h)/2,w,h,0,0,box.width,box.height);
    drawScan(W,H);
  },180);
}
const stage=document.getElementById('gl');
let drag=null,dragStart=[0,0],turnX=0,turnY=0,turnQueued=false;
function queueTurn(){
  if(turnQueued)return;
  turnQueued=true;
  requestAnimationFrame(()=>{turnQueued=false;turnView(turnX,turnY);turnX=turnY=0;render()});
}
stage.addEventListener('pointerdown',e=>{if(toolDown(e,stage))return;drag=[e.clientX,e.clientY];dragStart=[e.clientX,e.clientY];stage.setPointerCapture(e.pointerId)});
stage.addEventListener('pointermove',e=>{
  if(toolMove(e))return;
  if(!drag)return;
  const dx=e.clientX-drag[0],dy=e.clientY-drag[1];
  drag=[e.clientX,e.clientY];
  if(e.shiftKey){
    cam.panX+=2*dx/stage.clientWidth;cam.panY-=2*dy/stage.clientHeight;
    render();
    return;
  }
  turnX+=dx*.01;turnY+=dy*.01;queueTurn();
});
stage.addEventListener('pointerup',e=>{if(toolUp())return;drag=null;clickedStage(stage,e,dragStart[0],dragStart[1])});
stage.addEventListener('wheel',e=>{e.preventDefault();cam.zoom=Math.min(12,Math.max(.4,cam.zoom*Math.exp(-e.deltaY*.0015)));render()},{passive:false});
for(const id of['showStone','showInc','showIgnored','showPlan'])document.getElementById(id).addEventListener('change',()=>{render();queueInset()});
new ResizeObserver(()=>{render();queueInset()}).observe(stage);
(function tick(){if(document.getElementById('spin').checked&&tab==='model'){if(scanMode){spinStep=(spinStep+1)%2;if(!spinStep){frameAt++;showFrame()}}else{turnView(.008,0);render()}}requestAnimationFrame(tick)})();

