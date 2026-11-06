// Fitting and Auto plan (through the workers in fitter.js), plan files.
'use strict';
// Number keys: fit that many of the largest stones, keeping green inclusions out.
let fitWorker=null;
const MERGE_UM=15;
const fitterUrl=()=>URL.createObjectURL(new Blob([`(${fitterCode})()`],{type:'text/javascript'}));
function showOwnPlan(s,list,saws,width){
  s.ownSaws=saws;s.ownSawWidth=width;
  s.ownPlan=list.map(o=>{
    const a=o.axis,angles=[0,Math.acos(Math.max(-1,Math.min(1,a[2]))),Math.atan2(a[0],-a[1])],{planes,...prop}=o.cut;
    return{D:o.D,center:o.center,angles,prop,mesh:brilliant({D:o.D,angles,center:o.center},prop),ct:prop.k*(o.D/1000)**3};
  });
  if(stones[current]===s){uploadPlan(s);render();queueInset();renderDetails(s)}
}
function fitStones(count,fixedSaws=null){
  const s=stones[current];
  if(!s||!s.stone)return;
  showOnly(null);
  if(!limitsUsable()){$('fitInfo').textContent='Cut limits cannot be met. Check the Cut limits tab.';return}
  stopFits();
  if(!fixedSaws){s.profitPlan=false;s.autoResults=null}
  const {verts,tris,inclusions,used,sizes,allSizes}=fitInput(s);
  const started=performance.now(),sawWidth=fixedSaws?s.ownSawWidth:sawSetting(s);
  $('fitInfo').textContent=`Fitting ${count} stone${count>1?'s':''}…`;
  fitWorker=new Worker(fitterUrl());
  fitWorker.onerror=e=>{$('fitInfo').textContent=`Fitting failed: ${e.message}`};
  fitWorker.onmessage=({data})=>{
    if(data.progress!==undefined){$('fitInfo').textContent=`Fitting ${count} stones… ${Math.round(Math.min(1,data.progress)*100)}%`;return}
    if(data.partial){showOwnPlan(s,data.partial,data.saws,sawWidth);return}
    fitWorker.terminate();fitWorker=null;
    if(!data.stones.length&&fixedSaws){$('fitInfo').textContent='No stone fits on either side of this saw. Move it again.';return}
    if(!data.stones.length){s.ownPlan=null;uploadPlan(s);render();$('fitInfo').textContent='No stone fits with these green inclusions.';return}
    showOwnPlan(s,data.stones,data.saws,sawWidth);
    const total=s.ownPlan.reduce((a,x)=>a+x.ct,0),sizes=s.ownPlan.map(x=>(x.D/1000).toFixed(2)).join(', ');
    $('fitInfo').textContent=`${s.ownPlan.length} stone${s.ownPlan.length>1?'s':''}: ${sizes} mm · about ${total.toFixed(4)} ct · ${((performance.now()-started)/1000).toFixed(0)} s`+(s.ownPlan.length<count?` (only ${s.ownPlan.length} fit)`:'');
  };
  fitWorker.postMessage({verts,tris,inclusions,allInclusions:used,count,cuts:cutsFromLimits(),sawWidth,safety:safetySetting(),roughSafety:roughSafetySetting(),profit:s.profitPlan?profitSettings():null,fixedSaws,sizes,allSizes,autoTable:autoTableSetting(),autoCulet:autoCuletSetting(),tableDepth:tableDepthSetting(),culetStart:culetStartSetting(),culetBottom:culetBottomSetting()});
}
function stopFits(){
  if(fitWorker)fitWorker.terminate();
  fitWorker=null;
  autoWorkers.forEach(w=>w.terminate());
  autoWorkers=[];
  // Searches waiting in the pool or running in it end as stopped.
  for(const job of [...fitQueue,...fitRunning])job.done({stopped:true});
  fitQueue=[];fitRunning=[];
}
// One shared pool of fitter workers: searches from several stones queue here and use every free core.
const POOL_SIZE=Math.max(2,(navigator.hardwareConcurrency||4)-1);
let fitQueue=[],fitRunning=[];
function runFit(message){
  return new Promise(resolve=>{
    fitQueue.push({message,done:resolve});
    pumpFits();
  });
}
function pumpFits(){
  while(fitRunning.length<POOL_SIZE&&fitQueue.length){
    const job=fitQueue.shift(),w=new Worker(fitterUrl());
    job.worker=w;fitRunning.push(job);autoWorkers.push(w);
    const end=data=>{
      w.terminate();
      fitRunning=fitRunning.filter(j=>j!==job);autoWorkers=autoWorkers.filter(x=>x!==w);
      job.done(data);pumpFits();
    };
    w.onerror=e=>end({error:e.message||'worker failed'});
    w.onmessage=({data})=>{if(data.progress===undefined&&!data.partial)end(data)};
    w.postMessage(job.message);
  }
}
// Experimental two-stone search across the pool (see sweepTask). Returns the best complete pairs, priced, with counts.
async function sawSweepPair(s,o={}){
  const {dirs=400,step=40,keep1=300,keep2=50,quick=[30,15],full=[120,60],rounds=40,tune=12}=o;
  const I=fitInput(s),base={verts:I.verts,tris:I.tris,inclusions:I.inclusions,sizes:I.sizes,allInclusions:I.used,allSizes:I.allSizes,cuts:cutsFromLimits(),sawWidth:sawSetting(s),safety:safetySetting(),roughSafety:roughSafetySetting(),profit:profitSettings(),autoTable:autoTableSetting(),autoCulet:autoCuletSetting(),tableDepth:tableDepthSetting(),culetStart:culetStartSetting(),culetBottom:culetBottomSetting(),mode:'sawSweep'};
  const P=s.stone.pos,planes=[];
  for(let i=0;i<dirs;i++){
    const z=(i+.5)/dirs,r=Math.sqrt(1-z*z),t=i*Math.PI*(3-Math.sqrt(5)),n=[r*Math.cos(t),r*Math.sin(t),z];
    let lo=Infinity,hi=-Infinity;
    for(let k=0;k<P.length;k+=3){const d=P[k]*n[0]+P[k+1]*n[1]+P[k+2]*n[2];if(d<lo)lo=d;if(d>hi)hi=d}
    for(let off=lo+step*3;off<hi-step*3;off+=step)planes.push([planes.length,n,off]);
  }
  const chunks=(list,parts)=>Array.from({length:parts},(_,k)=>list.filter((_,j)=>j%parts===k)).filter(c=>c.length);
  const run=async(step,items,extra)=>{
    const res=await Promise.all(chunks(items,POOL_SIZE*3).map(c=>runFit({...base,...extra,step,[step==='fit'?'planes':'pairs']:c})));
    return{list:res.flatMap(r=>r.sweep||[]),fits:res.reduce((t,r)=>t+(r.fits||0),0)};
  };
  const t0=performance.now(),diag={planes:planes.length};
  const lap=()=>Math.round((performance.now()-t0)/1000);
  const s1=await run('fit',planes,{tries:quick[0],tune:quick[1]});
  const all1=s1.list.sort((a,b)=>b.w-a.w),top1=all1.slice(0,keep1);diag.quick={saws:planes.length,withPair:all1.length,kept:top1.length,fits:s1.fits,seconds:lap()};
  const s2=await run('fit',top1.map(p=>[p.i,p.n,p.off]),{tries:full[0],tune:full[1]});
  const top2=s2.list.sort((a,b)=>b.w-a.w).slice(0,keep2);diag.refit={saws:top1.length,withPair:s2.list.length,kept:top2.length,fits:s2.fits,seconds:lap()};
  const s3=await run('climb',top2,{rounds,tune});diag.polish={pairs:top2.length,fits:s3.fits,seconds:lap()};
  const s4=await run('finish',s3.list,{});diag.finish={pairs:s4.list.length,valid:s4.list.filter(p=>p.valid).length,fits:s4.fits,seconds:lap()};
  return{pairs:s4.list.sort((a,b)=>b.t-a.t),quickAll:all1.map(p=>({i:p.i,w:p.w})),stage1:top1,stage2:top2,planes,diag};
}
// A finer set of cuts inside the actual Cut limits, for the experimental single-stone finish.
function fineCutsFromLimits(){
  const a=actualLimits(),at=(r,f)=>r[0]+(r[1]-r[0])*f,out=[];
  for(const tf of [0,.25,.5,.75,1])for(const cf of [0,.5,1])for(const pf of [0,.5,1])for(const gf of [0,.5,1])for(const sf of [0,.5,1]){
    const girdle=at(a.girdle,gf),c=makeCut(`fine ${out.length}`,at(a.table,tf),at(a.crownAngle,cf),at(a.pavAngle,pf),girdle,at(a.star,sf),at(a.half,sf));
    const crown=c.crown*100,pav=c.pavilion*100,inside=(v,r)=>v>=r[0]-1e-6&&v<=r[1]+1e-6;
    if(inside(crown,a.crown)&&inside(pav,a.pavilion)&&inside(crown+pav+girdle,a.total))out.push(c);
  }
  return out;
}
// A finer set of cuts with star and lower half set separately, for the climb version's finish.
function fineCutsFree(){
  const a=actualLimits(),at=(r,f)=>r[0]+(r[1]-r[0])*f,out=[];
  for(const tf of [0,.25,.5,.75,1])for(const cf of [0,.5,1])for(const pf of [0,.5,1])for(const gf of [0,1])for(const sf of [0,.5,1])for(const hf of [0,.5,1]){
    const girdle=at(a.girdle,gf),c=makeCut(`free ${out.length}`,at(a.table,tf),at(a.crownAngle,cf),at(a.pavAngle,pf),girdle,at(a.star,sf),at(a.half,hf));
    const crown=c.crown*100,pav=c.pavilion*100,inside=(v,r)=>v>=r[0]-1e-6&&v<=r[1]+1e-6;
    if(inside(crown,a.crown)&&inside(pav,a.pavilion)&&inside(crown+pav+girdle,a.total))out.push(c);
  }
  return out;
}
// Experimental single stone, climb version: many random tries across the pool, the best different places climbed with
// self-adjusting steps, then a finer set of cuts. Returns the heaviest, highest-value and highest-profit stones.
async function singleClimbSearch(s,o={}){
  const opt={samples:2000,keepPerPart:10,keep:100,climbCentre:40,climbAngle:3,climbSteps:400,centreMin:1,angleMin:.05,centreStep:4,angleStep:.3,finishClimb:true,finishClimbCentre:8,finishClimbAngle:.6,finishClimbSteps:200,...o};
  const I=fitInput(s),rates=profitSettings(),base={verts:I.verts,tris:I.tris,inclusions:I.inclusions,sizes:I.sizes,allInclusions:I.used,allSizes:I.allSizes,cuts:cutsFromLimits(),sawWidth:sawSetting(s),safety:safetySetting(),roughSafety:roughSafetySetting(),autoTable:autoTableSetting(),autoCulet:autoCuletSetting(),tableDepth:tableDepthSetting(),culetStart:culetStartSetting(),culetBottom:culetBottomSetting(),mode:'single',opt};
  if(o.safety!==undefined)base.safety=o.safety;
  const t0=performance.now(),lap=()=>Math.round((performance.now()-t0)/1000),diag={},parts=POOL_SIZE,w=st=>st.cut.k*(st.D/1000)**3;
  const r1=await Promise.all(Array.from({length:parts},(_,part)=>runFit({...base,step:'singleSample',part})));
  const sampled=r1.flatMap(r=>r.single||[]).sort((a,b)=>w(b)-w(a));diag.sample={tries:parts*opt.samples,kept:sampled.length,fits:r1.reduce((t,r)=>t+(r.fits||0),0),seconds:lap()};
  const kept=[];
  for(const st of sampled){
    if(kept.every(k=>Math.hypot(...k.center.map((v,i)=>v-st.center[i]))>40||Math.acos(Math.max(-1,Math.min(1,k.axis.reduce((t,v,i)=>t+v*st.axis[i],0))))>4*Math.PI/180))kept.push(st);
    if(kept.length>=opt.keep)break;
  }
  const chunk=list=>Array.from({length:Math.min(parts,list.length)},(_,k)=>list.filter((_,j)=>j%Math.min(parts,list.length)===k));
  const r2=await Promise.all(chunk(kept).map((c,part)=>runFit({...base,step:'singleClimb',stones:c,part})));
  const climbed=r2.flatMap(r=>r.single||[]).sort((a,b)=>w(b)-w(a));diag.climb={stones:climbed.length,fits:r2.reduce((t,r)=>t+(r.fits||0),0),seconds:lap()};
  const fine=fineCutsFree();
  const r3=await Promise.all(chunk(climbed.slice(0,10)).map(c=>runFit({...base,step:'singleFinish',stones:c,fine})));
  const done=r3.flatMap(r=>r.single||[]);diag.finish={stones:done.length,valid:done.filter(x=>x.valid).length,fineCuts:fine.length,fits:r3.reduce((t,r)=>t+(r.fits||0),0),seconds:lap()};
  const below=Math.round((rates.blockFrom-.005)*1000)-1,above=Math.round((rates.blockTo+.005)*1000);
  const price=st=>{const at=D=>({D,...stoneMoney(D,st.cut.k*(D/1000)**3,rates)});if(st.D<below)return at(st.D);if(st.D<above)return at(below);const f=at(st.D),h=at(below);return f.profit>=h.profit?f:h};
  const valid=done.filter(x=>x.valid).map(st=>({...st,ct:w(st),money:price(st)}));
  const pick=f=>valid.length?valid.reduce((a,b)=>f(b)>f(a)?b:a):null;
  return{heaviest:pick(x=>x.ct),value:pick(x=>x.money.value),profit:pick(x=>x.money.profit),all:valid,climbedTop:climbed.slice(0,10),diag};
}
// Experimental single stone across the pool (see singleTask). Returns the heaviest, highest-value and highest-profit stones.
async function singleSearch(s,o={}){
  const opt={open:40,spread:60,dirs:400,cutList:[0,16,32,47],centreStep:80,angleStep:8,centreMin:2,angleMin:.25,keep:30,...o};
  const I=fitInput(s),rates=profitSettings(),base={verts:I.verts,tris:I.tris,inclusions:I.inclusions,sizes:I.sizes,allInclusions:I.used,allSizes:I.allSizes,cuts:cutsFromLimits(),sawWidth:sawSetting(s),safety:safetySetting(),roughSafety:roughSafetySetting(),autoTable:autoTableSetting(),autoCulet:autoCuletSetting(),tableDepth:tableDepthSetting(),culetStart:culetStartSetting(),culetBottom:culetBottomSetting(),mode:'single',opt};
  const t0=performance.now(),lap=()=>Math.round((performance.now()-t0)/1000),diag={},parts=POOL_SIZE*2,w=st=>st.cut.k*(st.D/1000)**3;
  const r1=await Promise.all(Array.from({length:parts},(_,part)=>runFit({...base,step:'singleStart',part,parts})));
  const starts=r1.flatMap(r=>r.single||[]).sort((a,b)=>w(b)-w(a));diag.start={stones:starts.length,fits:r1.reduce((t,r)=>t+(r.fits||0),0),seconds:lap()};
  // Keep different places: a start within 60 um and 6 degrees of a better one is left out.
  const kept=[];
  for(const st of starts){
    if(kept.every(k=>Math.hypot(...k.center.map((v,i)=>v-st.center[i]))>60||Math.acos(Math.min(1,Math.abs(k.axis.reduce((t,v,i)=>t+v*st.axis[i],0))))>6*Math.PI/180))kept.push(st);
    if(kept.length>=opt.keep)break;
  }
  const chunk=list=>Array.from({length:Math.min(parts,list.length)},(_,k)=>list.filter((_,j)=>j%Math.min(parts,list.length)===k));
  const r2=await Promise.all(chunk(kept).map(c=>runFit({...base,step:'singleRefine',stones:c})));
  const refined=r2.flatMap(r=>r.single||[]).sort((a,b)=>w(b)-w(a));diag.refine={stones:refined.length,fits:r2.reduce((t,r)=>t+(r.fits||0),0),seconds:lap()};
  const fine=fineCutsFromLimits();
  const r3=await Promise.all(chunk(refined.slice(0,10)).map(c=>runFit({...base,step:'singleFinish',stones:c,fine})));
  const done=r3.flatMap(r=>r.single||[]);diag.finish={stones:done.length,valid:done.filter(x=>x.valid).length,fineCuts:fine.length,fits:r3.reduce((t,r)=>t+(r.fits||0),0),seconds:lap()};
  // As sized() in the worker: below the blocked sizes as found, inside them held just below, above them whichever earns more.
  const below=Math.round((rates.blockFrom-.005)*1000)-1,above=Math.round((rates.blockTo+.005)*1000);
  const price=st=>{const at=D=>({D,...stoneMoney(D,st.cut.k*(D/1000)**3,rates)});if(st.D<below)return at(st.D);if(st.D<above)return at(below);const f=at(st.D),h=at(below);return f.profit>=h.profit?f:h};
  const valid=done.filter(x=>x.valid).map(st=>({...st,ct:w(st),money:price(st)}));
  const pick=f=>valid.length?valid.reduce((a,b)=>f(b)>f(a)?b:a):null;
  return{heaviest:pick(x=>x.ct),value:pick(x=>x.money.value),profit:pick(x=>x.money.profit),all:valid,diag};
}
// Experimental facet-aligned two-stone search across the pool (see alignedSide). Same sweep and finish as sawSweepPair.
async function alignedSweepPair(s,o={}){
  const {dirs=300,step=50,keep1=300,keep2=30,quick={phis:[0,Math.PI/2,Math.PI,3*Math.PI/2],centers:6,cutList:[0,24],tune:8},
    full={phis:Array.from({length:12},(_,k)=>k*Math.PI/6),centers:20,cutList:[0,8,16,24,32,40],tune:30},
    local={phis:Array.from({length:12},(_,k)=>k*Math.PI/6),centers:8,cutList:[0,8,16,24,32,40],tune:20},tilt=1.5,shifts=[-30,0,30]}=o;
  const I=fitInput(s),base={verts:I.verts,tris:I.tris,inclusions:I.inclusions,sizes:I.sizes,allInclusions:I.used,allSizes:I.allSizes,cuts:cutsFromLimits(),sawWidth:sawSetting(s),safety:safetySetting(),roughSafety:roughSafetySetting(),profit:profitSettings(),autoTable:autoTableSetting(),autoCulet:autoCuletSetting(),tableDepth:tableDepthSetting(),culetStart:culetStartSetting(),culetBottom:culetBottomSetting(),mode:'sawSweep'};
  const P=s.stone.pos,planes=[];
  for(let i=0;i<dirs;i++){
    const z=(i+.5)/dirs,r=Math.sqrt(1-z*z),t=i*Math.PI*(3-Math.sqrt(5)),n=[r*Math.cos(t),r*Math.sin(t),z];
    let lo=Infinity,hi=-Infinity;
    for(let k=0;k<P.length;k+=3){const d=P[k]*n[0]+P[k+1]*n[1]+P[k+2]*n[2];if(d<lo)lo=d;if(d>hi)hi=d}
    for(let off=lo+step*3;off<hi-step*3;off+=step)planes.push([planes.length,n,off]);
  }
  const chunks=(list,parts)=>Array.from({length:parts},(_,k)=>list.filter((_,j)=>j%parts===k)).filter(c=>c.length);
  const run=async(step,items,extra)=>{
    const res=await Promise.all(chunks(items,POOL_SIZE*3).map(c=>runFit({...base,...extra,step,[['fit','aligned'].includes(step)?'planes':'pairs']:c})));
    return{list:res.flatMap(r=>r.sweep||[]),fits:res.reduce((t,r)=>t+(r.fits||0),0)};
  };
  const t0=performance.now(),lap=()=>Math.round((performance.now()-t0)/1000),diag={planes:planes.length};
  const s1=await run('aligned',planes,{opt:quick});
  const all1=s1.list.sort((a,b)=>b.w-a.w),top1=all1.slice(0,keep1);diag.quick={saws:planes.length,withPair:all1.length,kept:top1.length,fits:s1.fits,seconds:lap()};
  const s2=await run('aligned',top1.map(p=>[p.i,p.n,p.off]),{opt:full});
  const top2=s2.list.sort((a,b)=>b.w-a.w).slice(0,keep2);diag.full={saws:top1.length,withPair:s2.list.length,kept:top2.length,fits:s2.fits,seconds:lap()};
  const s3=await run('alignedLocal',top2,{opt:local,tilt,shifts});diag.local={pairs:top2.length,fits:s3.fits,seconds:lap()};
  const s4=await run('finish',s3.list,{});diag.finish={pairs:s4.list.length,valid:s4.list.filter(p=>p.valid).length,seconds:lap()};
  return{pairs:s4.list.sort((a,b)=>b.t-a.t),quickAll:all1.map(p=>({i:p.i,w:p.w})),stage1:top1,stage2:top2,planes,diag};
}
// The one-stone plan from the climb search, in the shape the worker returns.
async function singleClimbRow(s){
  const R=await singleClimbSearch(s);
  if(!R.profit)return{stones:[],saws:[],kind:'climb'};
  const st=R.profit;
  return{stones:[{D:st.money.D,full:st.full,center:st.center,axis:st.axis,cut:st.cut}],saws:[],kind:'climb'};
}
// Every stone count of one stone, through the pool. Rows hold the plan and its profit for each count.
async function autoPlanRows(s){
  const {verts,tris,inclusions,used,sizes,allSizes}=fitInput(s),rates=profitSettings(),sawWidth=sawSetting(s);
  const base={verts,tris,inclusions,allInclusions:used,cuts:cutsFromLimits(),sawWidth,safety:safetySetting(),roughSafety:roughSafetySetting(),profit:rates,fixedSaws:null,sizes,allSizes,autoTable:autoTableSetting(),autoCulet:autoCuletSetting(),tableDepth:tableDepthSetting(),culetStart:culetStartSetting(),culetBottom:culetBottomSetting()};
  const rows=await Promise.all(Array.from({length:AUTO_COUNTS},(_,i)=>(i===0?singleClimbRow(s):runFit({...base,count:i+1})).then(data=>{
    const count=i+1;
    if(data.stopped)return{count,stones:[],saws:[],profit:0,sawWidth,stopped:true};
    if(data.error||!data.stones)return{count,stones:[],saws:[],profit:0,sawWidth};
    const money=data.stones.map(o=>stoneMoney(o.D,o.cut.k*(o.D/1000)**3,rates));
    return{count,stones:data.stones,saws:data.saws||[],sawWidth,lost:data.lost||[],kind:data.kind,profit:money.reduce((a,m)=>a+m.profit,0)};
  })));
  // Each row is its own search, so a try for more stones can end with a better plan for fewer. That plan fills the smaller row too.
  for(const r of rows){
    const row=rows.find(o=>o.count===r.stones.length);
    if(row&&row!==r&&r.profit>row.profit)Object.assign(row,{stones:r.stones,saws:r.saws,kind:r.kind,lost:[],profit:r.profit,from:r.count});
  }
  return rows;
}
// Tries every stone count at once and keeps the plan that earns the most.
async function autoPlan(){
  const s=stones[current];
  if(!s||!s.stone)return;
  showOnly(null);
  if(!limitsUsable()){$('fitInfo').textContent='Cut limits cannot be met. Check the Cut limits tab.';return}
  stopFits();
  const started=performance.now();
  $('fitInfo').textContent='Auto plan…';
  const rows=await autoPlanRows(s);
  if(rows.some(r=>r.stopped)){autoFinished?.();return}
  s.autoResults=rows;s.profitPlan=true;
  const good=rows.filter(r=>r.stones.length);
  if(!good.length){if(stones[current]===s)clearFit();$('fitInfo').textContent='No plan earns a profit with these inclusions.';autoFinished?.();return}
  const best=good.reduce((a,b)=>b.profit>a.profit?b:a);
  showAutoPlan(s,best);
  if(stones[current]===s)$('fitInfo').textContent=`Best plan: ${best.stones.length} stone${best.stones.length>1?'s':''} · profit ${rupees(best.profit)} · ${((performance.now()-started)/1000).toFixed(0)} s`;
  autoFinished?.();
}
function showAutoPlan(s,row){
  s.autoShown=row.count;
  showOwnPlan(s,row.stones,row.saws,row.sawWidth);
}
// Each inclusion's size: the 3D diagonal of the box around all its pieces. Advisor's exact measure is not known.
function inclusionSizes(s){
  if(s.incSizes?.count===s.inclusions.length)return s.incSizes.map;
  const boxes=new Map;
  for(const i of s.inclusions){
    if(!boxes.has(i.id))boxes.set(i.id,[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]]);
    const [lo,hi]=boxes.get(i.id),P=i.mesh.pos;
    for(const v of new Set(i.mesh.tris))for(let k=0;k<3;k++){const c=P[v*3+k];if(c<lo[k])lo[k]=c;if(c>hi[k])hi[k]=c}
  }
  const map=new Map([...boxes].map(([id,[lo,hi]])=>[id,Math.hypot(...hi.map((v,k)=>v-lo[k]))]));
  s.incSizes={count:s.inclusions.length,map};
  return map;
}
function fitInput(s){
  const {tris,pos:verts}=s.stone;
  // Size codes for the search: 1 Use, 0 Auto, and two for inclusions too big for the bottom of a stone: .5 Auto, .25 Ignore.
  const whole=inclusionSizes(s),limit=culetLimitSetting(),tooBig=i=>whole.get(i.id)>limit;
  const chosen=s.inclusions.filter(i=>!i.ignored||tooBig(i));
  const pieces=new Map;for(const i of chosen){if(!pieces.has(i.id))pieces.set(i.id,[]);pieces.get(i.id).push(i)}
  let n=0;for(const i of chosen)n+=i.mesh.pos.length+i.mesh.tris.length;
  const pts=new Float32Array(n),big=new Float32Array(n/3);let o=0;
  for(const i of chosen){
    const p=i.mesh.pos,t=i.mesh.tris,first=o/3,size=i.ignored?.25:i.auto?(tooBig(i)?.5:0):1;
    // A split part shares its corner list with the other part, so only its own corners count.
    if(i.split)for(const v of new Set(t)){pts[o++]=p[v*3];pts[o++]=p[v*3+1];pts[o++]=p[v*3+2]}
    else{pts.set(p,o);o+=p.length}
    // Triangle middles as well as corners, so a stone cannot slip between the corners of a large piece.
    for(let k=0;k<t.length;k+=3)for(let c=0;c<3;c++)pts[o++]=(p[t[k]*3+c]+p[t[k+1]*3+c]+p[t[k+2]*3+c])/3;
    big.fill(size,first,o/3);
  }
  // Points closer than this are nearly the same place, so one of them is enough while searching.
  const seen=new Map,kept=[],keptSize=[];
  for(let i=0;i<o;i+=3){
    const key=Math.round(pts[i]/MERGE_UM)+','+Math.round(pts[i+1]/MERGE_UM)+','+Math.round(pts[i+2]/MERGE_UM);
    // Points merged here keep the largest inclusion they came from.
    if(seen.has(key)){const at=seen.get(key);keptSize[at]=Math.max(keptSize[at],big[i/3]);continue}
    seen.set(key,keptSize.length);kept.push(pts[i],pts[i+1],pts[i+2]);keptSize.push(big[i/3]);
  }
  return{verts,tris:Int32Array.from(tris),inclusions:Float32Array.from(kept),used:pts.subarray(0,o),sizes:Float32Array.from(keptSize),allSizes:big.subarray(0,o/3)};
}
function clearFit(){
  const s=stones[current];
  stopFits();
  if(s){s.autoResults=null;s.profitPlan=false}
  if(s&&s.ownPlan){s.ownPlan=null;uploadPlan(s);render();queueInset();renderDetails(s)}
  $('fitInfo').textContent='';
}
// Plans are kept in their own file beside the stone.
const PLAN_VERSION=1,MAX_PLAN_STONES=5;
function planFor(s){
  const fitted=!!s.ownPlan,width=fitted?s.ownSawWidth:s.fileSawWidth||0;
  const saws=fitted?s.ownSaws||[]:s.sawNormal&&s.sawOffset?[{normal:s.sawNormal,offset:s.sawOffset-width/2,within:[]}]:[];
  return{
    format:'adv-viewer-plan',version:PLAN_VERSION,savedAt:new Date().toISOString(),
    stone:{name:s.name,file:s.file.name,size:s.file.size},
    source:fitted?'fitted':'advisor',sawWidth:width,safety:safetySetting(),roughSafety:roughSafetySetting(),saws,
    ignoredInclusions:[...new Set(s.inclusions.filter(i=>i.ignored).map(i=>i.id))],
    splits:s.splits||[],
    cutLimits:limits,
    stones:activeStones(s).map(r=>({D:r.D,center:[...r.center],angles:[...r.angles],proportions:{...r.prop,skin:undefined}}))
  };
}
function savePlan(){
  const s=stones[current];if(!s)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(planFor(s),null,1)],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download=`${s.name}.plan.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('fitInfo').textContent=`Plan saved as ${a.download}. The .adv file is unchanged.`;
}
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
const isVec=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(isNum);
function planProblem(p,s){
  if(!p||p.format!=='adv-viewer-plan'||p.version!==PLAN_VERSION)return'This is not a plan file from this viewer.';
  if(!p.stone||p.stone.name!==s.name||p.stone.size!==s.file.size)return`This plan is for ${p.stone?.name||'another stone'}, not ${s.name}.`;
  if(!Array.isArray(p.stones)||!p.stones.length||p.stones.length>MAX_PLAN_STONES)return'The plan has no usable stones.';
  for(const r of p.stones){
    const q=r.proportions;
    if(!isNum(r.D)||r.D<=0||!isVec(r.center,3)||!isVec(r.angles,3)||!q||![q.table,q.crown,q.girdle,q.pavilion,q.star,q.half].every(isNum))return'The plan file is damaged.';
  }
  if(!isNum(p.sawWidth)||!Array.isArray(p.saws)||!Array.isArray(p.ignoredInclusions))return'The plan file is damaged.';
  if(!p.saws.every(c=>isVec(c.normal,3)&&isNum(c.offset)&&Array.isArray(c.within)&&c.within.every(w=>isVec(w,4))))return'The plan file is damaged.';
  if(!LIMIT_ROWS.every(([k])=>isVec(p.cutLimits?.[k],2)))return'The plan file is damaged.';
  if(p.safety!==undefined&&!(isNum(p.safety)&&p.safety>=0&&p.safety<=200))return'The plan file is damaged.';
  if(p.splits!==undefined&&!(Array.isArray(p.splits)&&p.splits.every(c=>isNum(c.id)&&isVec(c.normal,3)&&isNum(c.offset))))return'The plan file is damaged.';
  return null;
}
function applyPlan(s,p){
  showOnly(null);
  stopFits();
  s.autoResults=null;s.profitPlan=false;
  limits=p.cutLimits;saveLimits();
  try{localStorage.setItem('adv-saw-width',p.sawWidth);if(p.safety!==undefined)localStorage.setItem('adv-safety',p.safety);}catch{}
  renderLimits();
  replaySplits(s,p.splits||[]);
  const off=new Set(p.ignoredInclusions);
  for(const i of s.inclusions)i.ignored=off.has(i.id);
  s.ownSaws=p.saws;s.ownSawWidth=p.sawWidth;
  s.ownPlan=p.stones.map(r=>{
    const o={D:r.D,center:r.center,angles:r.angles,prop:r.proportions};
    o.mesh=brilliant(o,o.prop);
    return o;
  });
  uploadInclusions(s);rememberPicks(s);uploadPlan(s);showPicks();renderDetails(s);render();queueInset();
}
async function openPlan(file){
  const s=stones[current];
  if(!s){$('empty').firstElementChild.textContent='Open the stone first, then its plan.';return}
  let plan=null;
  try{plan=JSON.parse(await file.text())}catch{}
  const problem=planProblem(plan,s);
  if(problem){$('fitInfo').textContent=problem;return}
  applyPlan(s,plan);
  $('fitInfo').textContent=`Plan opened: ${plan.stones.length} stone${plan.stones.length>1?'s':''}, saved ${new Date(plan.savedAt).toLocaleString()}.`;
}
