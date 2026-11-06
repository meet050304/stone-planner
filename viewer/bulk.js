// Bulk plan, Fill Advisor saves, folders and the CSV export.
'use strict';
// Plans, saves and exports every .adv in the Stone folder, a few stones at once.
const BULK_STONES=3;
let limitsAway=null;
let bulkRunning=false,bulkStop=false;
function showBulk(rows,line){
  const money=v=>v===null||v===undefined?'—':rupees(v),gain=r=>r.profit===null||r.advisor===null?null:r.profit-r.advisor;
  const counted=rows.filter(r=>gain(r)!==null),sum=k=>counted.reduce((a,r)=>a+r[k],0);
  const better=counted.filter(r=>gain(r)>0).length,worse=counted.filter(r=>gain(r)<0).length;
  $('bulkReport').hidden=false;
  $('bulkReport').innerHTML=`<p><b>${esc(line)}</b>${bulkRunning?' <button id="bulkStop">Stop</button>':''}</p>
    <p class="sub">${counted.length} stones compared: ${better} earn more, ${worse} earn less. Before ${rupees(sum('advisor'))}, now ${rupees(sum('profit'))}, change ${rupees(sum('profit')-sum('advisor'))}. Rough cost ${rupees(sum('cost'))}, net profit ${rupees(sum('profit')-sum('cost'))}.</p>
    <table><thead><tr><th>Stone</th><th class="n">Stones</th><th>Sizes (mm)</th><th class="n">Profit</th><th class="n">Rough cost</th><th class="n">Net profit</th><th class="n">Plan before</th><th>Old sizes (mm)</th><th class="n">Change</th><th>Result</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="n">${r.count??'—'}</td><td>${esc(r.sizes||'—')}</td><td class="n">${money(r.profit)}</td><td class="n">${money(r.cost)}</td><td class="n">${r.profit===null||r.cost===undefined?'—':rupees(r.profit-r.cost)}</td><td class="n">${money(r.advisor)}</td><td>${esc(r.oldSizes||'—')}</td><td class="n">${money(gain(r))}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>`;
  if(bulkRunning)$('bulkStop').onclick=()=>{bulkStop=true;stopFits();autoFinished?.();$('bulkStop').disabled=true};
}
// The comparison is written after every stone, so a stopped run keeps what it finished.
async function writeCompare(rows){
  const text=['Stone,Old stones,Old sizes,Old profit,New stones,New sizes,New profit,Rough cost,Net profit,Change,Result',
    ...rows.map(r=>[r.name,r.oldCount??'',`"${r.oldSizes||''}"`,r.advisor===null?'':Math.round(r.advisor),r.count??'',`"${r.sizes||''}"`,r.profit===null?'':Math.round(r.profit),r.cost===undefined?'':Math.round(r.cost),r.profit===null||r.cost===undefined?'':Math.round(r.profit-r.cost),r.profit===null||r.advisor===null?'':Math.round(r.profit-r.advisor),`"${r.note}"`].join(','))].join('\r\n')+'\r\n';
  const out=await(await outputFolder.getFileHandle('bulk-compare.csv',{create:true})).createWritable();
  await out.write(text);await out.close();
}
// Every run starts from this window, so the folders are always seen and can be changed.
// A plan with a different stone count cannot go into the stone's own file. The user saves the stone again in Advisor
// with that count (any plan) into a folder of their own; each such file whose stone has a [name].plan.json in the
// Output folder gets that plan written into it, and the result goes to the Output folder as [name].adv. The chosen
// folder itself is only read. A file name may carry extra words after the stone name (1.S525-402-1STONE).
async function fillSaves(){
  if(!window.showDirectoryPicker){$('fitInfo').textContent='This browser cannot choose folders. Use a recent Chrome or Edge.';return}
  if(!outputFolder)await chooseFolder('output');
  if(!outputFolder||!await canWrite(outputFolder)){$('fitInfo').textContent='Not filled: no Output folder chosen.';return}
  let saves;
  try{saves=await window.showDirectoryPicker({id:'advisor-saves'})}catch{return}
  if(await saves.isSameEntry(outputFolder)){$('fitInfo').textContent='Choose the folder with the Advisor saves, not the Output folder.';return}
  const plans=new Map();
  for await(const [name,entry] of outputFolder.entries())if(entry.kind==='file'&&name.endsWith('.plan.json')&&!name.startsWith('._'))plans.set(name.slice(0,-10),entry);
  const lines=[];
  for await(const [name,entry] of saves.entries()){
    if(entry.kind!=='file'||!/\.adv$/i.test(name)||name.startsWith('._'))continue;
    let base=name.replace(/\.adv$/i,'');
    while(base&&!plans.has(base)&&base.includes('-'))base=base.slice(0,base.lastIndexOf('-'));
    if(!plans.has(base)){lines.push(`${name}: no plan file in ${outputFolder.name}`);continue}
    lines.push((await fillOne(entry,base,plans.get(base))).line);
  }
  $('bulkReport').hidden=false;
  $('bulkReport').innerHTML=`<p><b>Fill Advisor saves: ${lines.length} file${lines.length===1?'':'s'}</b></p><ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`;
  $('bulkReport').scrollIntoView({block:'nearest'});
}
// Writes a stone's plan file into Advisor's save of that stone. The result goes to the Output folder as [base].adv.
async function fillOne(entry,base,planHandle){
  const name=entry.name,fail=why=>({ok:false,why,line:`${name}: ${why}`});
  try{
    const file=await entry.getFile(),s=await openAdv(file),plan=JSON.parse(await(await planHandle.getFile()).text());
    if(plan.stones.length!==s.plannedStones.length)return fail(`holds ${s.plannedStones.length} stone${s.plannedStones.length>1?'s':''}, the plan has ${plan.stones.length}`);
    if((plan.saws?.length||0)!==(s.fileSaws?.length||0))return fail(`holds ${s.fileSaws?.length||0} saws, the plan has ${plan.saws?.length||0}`);
    plan.stone={name:s.name,file:file.name,size:file.size};
    const problem=planProblem(plan,s);
    if(problem)return fail(problem);
    replaySplits(s,plan.splits||[]);
    const off=new Set(plan.ignoredInclusions);
    for(const i of s.inclusions)i.ignored=off.has(i.id);
    s.ownSaws=plan.saws;s.ownSawWidth=plan.sawWidth;
    s.ownPlan=plan.stones.map(r=>{const o={D:r.D,center:r.center,angles:r.angles,prop:r.proportions};o.mesh=brilliant(o,o.prop);return o});
    // The plan was made on the stone's own rough. If this file's rough is not the same, a stone corner falls outside it
    // (each corner is tested 5 um in from the surface of the stone, so rounding at the rough's surface does not count).
    const inside=roughInside(s.stone);let stray=0;
    for(const o of s.ownPlan){const P=o.mesh.pos;for(let k=0;k<P.length;k+=3){const v=[P[k]-o.center[0],P[k+1]-o.center[1],P[k+2]-o.center[2]],l=Math.hypot(...v)||1,t=Math.max(0,l-5)/l;if(!inside(o.center[0]+v[0]*t,o.center[1]+v[1]*t,o.center[2]+v[2]*t))stray++}}
    if(stray)return fail(`not written, ${stray} stone corner${stray>1?'s':''} outside this file's rough (a different rough?)`);
    const r=await buildAdv(s);
    if(r.done.some(d=>d.includes('not matched')))return fail('a saw could not be matched');
    const out=await(await outputFolder.getFileHandle(`${base}.adv`,{create:true})).createWritable();
    await out.write(r.bytes);await out.close();
    return{ok:true,s,line:`${name} → ${base}.adv: ${plan.stones.map(o=>(o.D/1000).toFixed(2)).join(' + ')} mm (${r.done.join(', ')})`};
  }catch(e){return fail(`failed, ${e.message}`)}
}
// Stones Advisor must save with another count are listed for advisor-resave-all on the Advisor PC. Its saves are filled
// here as they appear, so nobody has to press anything. It writes RESAVE_DONE when it has finished the list.
const RESAVE_LIST='resave-needed.csv',RESAVE_FOLDER='advisor-resaves',RESAVE_DONE='resave-done.txt',RESAVE_POLL=15000;
const removeFile=async(folder,name)=>{try{await folder.removeEntry(name)}catch{}};
async function fileIn(folder,name){try{return await folder.getFileHandle(name)}catch{return null}}
async function waitForResaves(rows,status,after){
  const need=rows.filter(r=>r.resave);
  if(!need.length)return;
  const folder=await outputFolder.getDirectoryHandle(RESAVE_FOLDER,{create:true}),sizes=new Map;
  await removeFile(folder,RESAVE_DONE);
  const text=['Stone,File,Stones,Saws',...need.map(r=>[r.name,r.file,r.resave.count,r.resave.saws].join(','))].join('\r\n')+'\r\n';
  await writeFile(outputFolder,RESAVE_LIST,text);
  const take=async r=>{
    if(r.resave.done)return;
    const handle=await fileIn(folder,`${r.name}-ADV${r.resave.count}.adv`);
    if(!handle)return;
    const size=(await handle.getFile()).size;
    if(sizes.get(r)!==size){sizes.set(r,size);return}
    const got=await fillOne(handle,r.name,await outputFolder.getFileHandle(`${r.name}.plan.json`));
    if(got.ok){
      Object.assign(r,{count:r.resave.count,sizes:r.resave.sizes,profit:r.resave.profit,note:'Saved at best count'});
      await exportCsv(got.s);
    }else r.note=`${r.note.replace(/, waiting.*$/,'')}, Advisor save not used: ${got.why}`;
    r.resave.done=true;
    after();
  };
  for(;;){
    const left=need.filter(r=>!r.resave.done);
    if(!left.length||bulkStop)break;
    status(`Waiting for Advisor: ${need.length-left.length} of ${need.length} re-saves filled. Start advisor-resave-all on the Advisor PC if it is not running.`);
    const finished=!!await fileIn(folder,RESAVE_DONE);
    for(const r of left)await take(r);
    if(finished){for(const r of left)await take(r);for(const r of need.filter(x=>!x.resave.done)){r.note=`${r.note.replace(/, waiting.*$/,'')}, Advisor saved no file`;r.resave.done=true}after();break}
    await new Promise(done=>setTimeout(done,RESAVE_POLL));
  }
}
async function stoneFiles(){
  const handles=[];
  for await(const [name,entry] of stoneFolder.entries())if(entry.kind==='file'&&/\.adv$/i.test(name))handles.push(entry);
  return handles.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
async function showBulkDialog(){
  $('bulkStone').textContent=stoneFolder?.name||'Not chosen';
  $('bulkOutput').textContent=outputFolder?.name||'Not chosen';
  $('bulkExport').textContent=exportFolder?.name||'Not chosen';
  const ready=stoneFolder&&outputFolder&&exportFolder;
  let note='Choose all three folders to start.';
  if(ready){
    note=`Press Start to plan every .adv in ${stoneFolder.name}. The originals are not changed.`;
    try{
      if(await stoneFolder.isSameEntry(outputFolder))note='The output folder must be different from the stone folder.';
      else if(!stoneFolder.queryPermission||await stoneFolder.queryPermission({mode:'read'})==='granted'){
        const n=(await stoneFiles()).length;
        note=n?`${n} .adv file${n>1?'s':''} will be planned. Originals are not changed: results go to ${outputFolder.name}.`:`No .adv files in ${stoneFolder.name}.`;
      }
    }catch{}
  }
  $('bulkNote').textContent=note;
  $('bulkNext').disabled=!ready;
}
async function bulkPlan(){
  if(bulkRunning)return;
  if(!window.showDirectoryPicker){$('fitInfo').textContent='This browser cannot choose folders. Use a recent Chrome or Edge.';return}
  // The whole Cut limits panel moves into the window while it is open, so every setting can be changed here.
  const panel=$('tab-limits');
  limitsAway={home:panel.parentNode,next:panel.nextSibling,hidden:panel.hidden};
  $('bulkLimitsHome').append(panel);panel.hidden=false;renderLimits();
  bulkStep(1);
  $('bulkDialog').showModal();
  await showBulkDialog();
}
async function pickBulkFolder(kind){
  await chooseFolder(kind);
  await showBulkDialog();
}
function bulkStep(n){
  $('bulkStep1').hidden=n!==1;$('bulkStep2').hidden=n!==2;
  $('bulkTitle').textContent=`Bulk plan: step ${n} of 2, ${n===1?'folders':'settings'}`;
  if(n===2){$('bulkNote2').textContent='';$('bulkDialog').scrollTop=0}
}
// The folders are checked before the settings step, so Start only has the settings left to judge.
async function bulkNext(){
  if(await stoneFolder.isSameEntry(outputFolder)){$('bulkNote').textContent='The output folder must be different from the stone folder.';return}
  if(!await canWrite(outputFolder)||!await canWrite(exportFolder)){$('bulkNote').textContent='Folder access was not allowed.';return}
  let handles;
  try{handles=await stoneFiles()}catch(e){$('bulkNote').textContent=`Cannot read ${stoneFolder.name}: ${e.message}`;return}
  if(!handles.length){$('bulkNote').textContent=`No .adv files in ${stoneFolder.name}.`;return}
  bulkStep(2);
}
async function startBulk(){
  if(!limitsUsable()){$('bulkNote2').textContent='Cut limits cannot be met. Change them, or press Reset to our values.';return}
  let handles;
  try{handles=await stoneFiles()}catch(e){$('bulkNote2').textContent=`Cannot read ${stoneFolder.name}: ${e.message}`;return}
  if(!handles.length){$('bulkNote2').textContent=`No .adv files in ${stoneFolder.name}.`;return}
  const useSaved=$('bulkPicks').value==='saved';
  $('bulkDialog').close();
  bulkRunning=true;bulkStop=false;
  await removeFile(outputFolder,RESAVE_LIST);
  showBulk([],'Starting…');
  $('bulkReport').scrollIntoView({block:'nearest'});
  const rows=handles.map(h=>({name:h.name.replace(/\.adv$/i,''),count:null,sizes:'',profit:null,advisor:null,note:'Waiting'})),started=performance.now();
  // A few stones are planned at once and their searches share the worker pool. Saves go one at a time.
  let next=0,finished=0,saving=Promise.resolve();
  const status=()=>showBulk(rows,`${finished} of ${handles.length} done, ${rows.filter(r=>r.note==='Planning…').length} planning`);
  const one=async n=>{
    const row=rows[n],handle=handles[n];
    row.note='Planning…';status();
    try{
      const s=await openAdv(await handle.getFile());
      if(!s.stone?.tris.length)throw new Error('no rough model in this file');
      const rates=profitSettings();
      row.cost=roughCost(s);
      row.advisor=s.plannedStones.length?s.plannedStones.reduce((a,r)=>a+stoneMoney(r.D,stoneWeight(r),rates).profit,0):null;
      row.oldSizes=s.plannedStones.map(r=>(r.D/1000).toFixed(2)).join(', ');
      row.oldCount=s.plannedStones.length;
      if(useSaved)for(const i of s.inclusions){i.ignored=i.state===0;i.auto=i.state===2}
      else autoPicks(s);
      const plans=await autoPlanRows(s);
      if(bulkStop||plans.some(r=>r.stopped)){row.note='Stopped, not saved';return}
      s.autoResults=plans;s.profitPlan=true;
      const good=plans.filter(r=>r.stones.length);
      // Every stone leaves a file Advisor can open: when no plan of ours earns more, its own file is copied as it is.
      const copyFile=()=>{const save=saving.then(()=>writeFile(outputFolder,handle.name,s.file));saving=save.catch(()=>{});return save};
      const own=(await planFacts(s)).blocked||row.advisor===null?-Infinity:row.advisor,keep=()=>Object.assign(row,{count:row.oldCount,sizes:row.oldSizes,profit:row.advisor});
      if(!good.length||good.every(r=>r.profit<=own)){
        await copyFile();keep();
        row.note=good.length?'Advisor\'s plan earned more, its file copied':'No profitable plan, Advisor\'s file copied';return;
      }
      const sawsIn=s.fileSaws?.length||0,holds=r=>r.stones.length===s.plannedStones.length&&r.saws.length===sawsIn;
      const best=good.reduce((a,b)=>b.profit>a.profit?b:a),inFile=good.filter(r=>holds(r)&&r.profit>own).sort((a,b)=>b.profit-a.profit)[0];
      const facts=()=>{
        row.count=s.ownPlan.length;row.sizes=s.ownPlan.map(r=>(r.D/1000).toFixed(2)).join(', ');
        row.profit=s.ownPlan.reduce((a,r)=>a+stoneMoney(r.D,stoneWeight(r),rates).profit,0);
      };
      const store=()=>{const save=saving.then(()=>saveStone(s,outputFolder));saving=save.catch(()=>{});return save};
      row.file=handle.name;
      showAutoPlan(s,best);facts();
      if(holds(best)){
        await store();
        row.note='Saved';
      }else{
        // The best plan needs Advisor's save with its count. Meanwhile the file holds the best plan it can.
        const wanted={count:row.count,saws:best.saws.length,sizes:row.sizes,profit:row.profit};
        await writeFile(outputFolder,`${s.name}.plan.json`,JSON.stringify(planFor(s),null,1));
        if(inFile){showAutoPlan(s,inFile);facts();await store()}
        else{await copyFile();keep()}
        const left=inFile?'best plan for this file saved':'Advisor\'s file copied';
        if(wanted.count>3)row.note=`${left}, ${wanted.count} stones not handled`;
        else{row.resave=wanted;row.note=`${left}, waiting for Advisor at ${wanted.count} stone${wanted.count>1?'s':''}`}
      }
    }catch(e){row.note=`Failed: ${e.message}`}
    finally{finished++;status();saving=saving.then(()=>writeCompare(rows)).catch(()=>{})}
  };
  const lane=async()=>{while(!bulkStop&&next<handles.length)await one(next++)};
  await Promise.all(Array.from({length:BULK_STONES},lane));
  await saving;
  rows.filter(r=>r.note==='Waiting').forEach(r=>r.note='Not started');
  if(!bulkStop)await waitForResaves(rows,line=>showBulk(rows,line),()=>{saving=saving.then(()=>writeCompare(rows)).catch(()=>{})});
  await saving;
  bulkRunning=false;
  const saved=rows.filter(r=>r.count!==null&&r.count!==undefined).length;
  showBulk(rows,`${bulkStop?'Stopped':'Finished'}: ${saved} of ${handles.length} files in ${outputFolder.name} · ${((performance.now()-started)/60000).toFixed(1)} min`);
}
// The bulk data file Advisor writes after each save, using the columns and 60 data rows of Laxmi_Galaxy_Sarin.txt.
// Saw columns follow the list of saws and do not belong to the stone on their row.
const CSV_HEADER='Stone Name,Rough Weight,Rough Length,Rough Height,SHape,WT,Pw,Cut,TD(%),TD(MM),Ratio,W,L,SW(%),SW(MM),Table(%),Table(MM),Crown,Crown H(%),Crown H(MM),Girdle(%),Girdle(MM),Pavil,Pavil D(%),Pavil D(MM),Tilt,Star,Half,Culet(%),Culet(MM),Color,Clarity,Fls,Total Dolar,Discount,Dolar,saw,PartName,Charni,UserName,PartWT,SawName,SawWeightCarat,LaserCuttingDepth,GradingInstitute,WeightAfterBruting,WeightAfterConing,WeightAfterTable,TableSurfaceDist,WeightAfterPavil,WeightAfterCrown,WeightAfterSaw'.split(',');
const CSV_ROWS=60,CSV_FILLER_FROM=9,VOLUME_STEP=25,STAGE_STEP=6;
// Advisor's SieveSize.xml: the largest diameter in each size group.
const SIEVES=[[1.1,'+0 -1.5'],[1.2,'+1.5 -2.5'],[1.25,'+2.5 -3.5'],[1.3,'+3.5 -4.0'],[1.4,'+4.0 -4.5'],[1.5,'+4.5 -5.0'],[1.55,'+5.0 -5.5'],[1.6,'+5.5 -6.0'],[1.7,'+6.0 -6.5'],[1.8,'+6.5 -7.0'],[1.9,'+7.0 -7.5'],[2,'+7.5 -8.0'],[2.15,'+8.0 -8.5'],[2.2,'+8.5 -9.0'],[2.3,'+9.0 -9.5'],[2.4,'+9.5 -10.0'],[2.5,'+10.0 -10.5'],[2.6,'+10.5 -11.0'],[2.7,'+11.0 -11.5'],[2.8,'+11.5 -12.0'],[2.9,'+12.0 -12.5'],[3,'+12.5 -13.0'],[3.1,'+13.0 -13.5'],[3.2,'+13.5 -14.0'],[3.3,'+14.0 -14.5'],[3.4,'+14.5 -15.0'],[3.5,'+15.0 -15.5'],[3.6,'+15.5 -16.0'],[3.7,'+16.0 -16.5'],[3.8,'+16.5 -17.0'],[3.9,'+17.0 -17.5'],[4,'+17.5 -18.0'],[4.1,'+18.0 -18.5'],[4.2,'+18.5 -19.0'],[4.3,'+19.0 -19.5'],[4.4,'+19.5 -20.0']];
const charniFor=mm=>SIEVES.find(([max])=>+mm.toFixed(2)<=max)?.[1]||'';
// Depth ranges of the rough along z for each square of a grid, used to measure pieces of it.
function roughColumns(s){
  if(s.columns)return s.columns;
  const P=s.stone.pos,T=s.stone.tris,hits=new Map;
  for(let i=0;i<T.length;i+=3){
    const [a,b,c]=[0,1,2].map(j=>{const v=T[i+j]*3;return[P[v],P[v+1],P[v+2]]}),d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(d)<1e-9)continue;
    const x0=Math.ceil(Math.min(a[0],b[0],c[0])/VOLUME_STEP),x1=Math.floor(Math.max(a[0],b[0],c[0])/VOLUME_STEP),y0=Math.ceil(Math.min(a[1],b[1],c[1])/VOLUME_STEP),y1=Math.floor(Math.max(a[1],b[1],c[1])/VOLUME_STEP);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const px=x*VOLUME_STEP,py=y*VOLUME_STEP,u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/d,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/d,w=1-u-v;
      if(u<0||v<0||w<0)continue;
      const key=x+','+y;
      if(!hits.has(key))hits.set(key,[]);
      hits.get(key).push(u*a[2]+v*b[2]+w*c[2]);
    }
  }
  s.columns=[...hits].map(([key,z])=>{const [x,y]=key.split(',').map(e=>e*VOLUME_STEP);return{x,y,z:z.sort((p,q)=>p-q)}});
  return s.columns;
}
// Weight of the part of the rough on the inner side of every [nx,ny,nz,d] cut, matched to the stored rough weight.
function roughWeight(s,cuts){
  let length=0,all=0;
  for(const {x,y,z} of roughColumns(s))for(let i=0;i+1<z.length;i+=2){
    let a=z[i],b=z[i+1],empty=false;
    all+=b-a;
    for(const [nx,ny,nz,d] of cuts){
      const left=d-nx*x-ny*y;
      if(Math.abs(nz)<1e-9){if(left>0)empty=true}
      else if(nz>0)a=Math.max(a,left/nz);
      else b=Math.min(b,left/nz);
    }
    if(!empty&&b>a)length+=b-a;
  }
  return all?s.rough*length/all:0;
}
// Weight of the rough left after each polishing step, by cutting it with the planned stone's shape.
function stageWeights(s,r,cuts){
  const P=r.prop,D=r.D,R=D/2,rt=P.table*R,top=-P.crown*D,gird=P.girdle*D,cul=gird+P.pavilion*D,b=r.angles[1],c=r.angles[2];
  const axis=[Math.sin(b)*Math.sin(c),-Math.sin(b)*Math.cos(c),Math.cos(b)],[cx,cy,cz]=r.center,crownSlope=(R-rt)/(P.crown*D);
  let all=0,table=0,bruting=0,coning=0,crown=0,pavil=0;
  for(const col of roughColumns(s))for(let i=0;i+1<col.z.length;i+=2)for(let w=col.z[i]+STAGE_STEP/2;w<col.z[i+1];w+=STAGE_STEP){
    all++;
    if(!cuts.every(([nx,ny,nz,d])=>nx*col.x+ny*col.y+nz*w>=d))continue;
    const x=col.x-cx,y=col.y-cy,e=w-cz,z=x*axis[0]+y*axis[1]+e*axis[2];
    if(z<top)continue;
    table++;
    const out=Math.sqrt(Math.max(0,x*x+y*y+e*e-z*z));
    if(out>R)continue;
    bruting++;
    if(z<0&&out>R+crownSlope*z){}else{crown++;if(z<=cul)coning++}
    if((z<=gird||out<=R*(cul-z)/(cul-gird))&&z<=cul)pavil++;
  }
  // Inner cuts use the true volume. The table cut reaches the outline, so it is matched to the stored rough weight.
  const unit=VOLUME_STEP*VOLUME_STEP*STAGE_STEP/1e9*3.52/200,ct=v=>(v*unit).toFixed(3);
  return{WeightAfterTable:(s.rough*table/all).toFixed(3),WeightAfterBruting:ct(bruting),WeightAfterConing:ct(coning),WeightAfterCrown:ct(crown),WeightAfterPavil:ct(pavil),
    'Culet(%)':ct(bruting),WeightAfterSaw:(s.rough*table/all).toFixed(3),TableSurfaceDist:tableDistance(s,axis,cx*axis[0]+cy*axis[1]+cz*axis[2]+top).toFixed(2)};
}
// How far the whole rough reaches past the table, ignoring any saw.
function tableDistance(s,axis,plane){
  const p=s.stone.pos;let low=Infinity;
  for(const v of new Set(s.stone.tris))low=Math.min(low,p[v*3]*axis[0]+p[v*3+1]*axis[1]+p[v*3+2]*axis[2]);
  return (plane-low)/1000;
}
function csvStone(r){
  const v=stoneRows(r),D=v.dia,mm=x=>(x/100*D).toFixed(2);
  return{SHape:'ROUND',Pw:stoneWeight(r).toFixed(3),Cut:'V.G.','TD(%)':v.total.toFixed(1),'TD(MM)':mm(v.total),Ratio:'1.00',W:D.toFixed(2),L:D.toFixed(2),
    'Table(%)':v.table.toFixed(1),'Table(MM)':mm(v.table),Crown:v.crownAngle.toFixed(2),'Crown H(%)':v.crown.toFixed(1),'Crown H(MM)':mm(v.crown),
    'Girdle(%)':`M: ${v.girdle.toFixed(1)}`,'Girdle(MM)':mm(v.girdle),Pavil:v.pavAngle.toFixed(2),'Pavil D(%)':v.pavilion.toFixed(1),'Pavil D(MM)':mm(v.pavilion),
    Star:v.star.toFixed(1),Half:v.half.toFixed(1),Charni:charniFor(D)};
}
function buildCsv(s){
  const plan=planFor(s),list=activeStones(s),width=plan.sawWidth,saws=list.length>1?plan.saws:[],bb=bbox(s.stone),size=k=>((bb.hi[k]-bb.lo[k])/1000).toFixed(2);
  const base={'Stone Name':s.name,'Rough Weight':s.rough.toFixed(3),'Rough Length':size(0),'Rough Height':size(2),Fls:'None'};
  const sawName=k=>`Saw1-${k+1}`,loss=saws.map(c=>{
    const [x,y,z]=c.normal;
    return roughWeight(s,[...c.within,[x,y,z,c.offset-width/2],[-x,-y,-z,-c.offset-width/2]]);
  });
  // Only one saw of Advisor's plan is decoded, so with more stones the stored part weights are used.
  const storedParts=!s.ownPlan&&list.length>saws.length+1,free=[...s.parts];
  const storedPart=r=>{
    const ct=stoneWeight(r),near=free.reduce((a,b)=>Math.abs(b.polish-ct)<Math.abs(a.polish-ct)?b:a);
    free.splice(free.indexOf(near),1);
    return near.weight;
  };
  const rows=list.map((r,i)=>{
    const cuts=[],b=r.angles[1],c0=r.angles[2],axis=[Math.sin(b)*Math.sin(c0),-Math.sin(b)*Math.cos(c0),Math.cos(b)];
    let own=-1,towards=[0,0,1];
    saws.forEach((c,k)=>{
      const on=q=>q[0]*r.center[0]+q[1]*r.center[1]+q[2]*r.center[2]>=q[3];
      if(!c.within.every(on))return;
      const n=c.normal,side=n[0]*r.center[0]+n[1]*r.center[1]+n[2]*r.center[2]>=c.offset?1:-1;
      cuts.push([n[0]*side,n[1]*side,n[2]*side,side*c.offset+width/2]);
      own=k;towards=n.map(e=>e*side);
    });
    const part=(storedParts?storedPart(r):roughWeight(s,cuts)).toFixed(3),saw=i<saws.length,along=axis[0]*towards[0]+axis[1]*towards[1]+axis[2]*towards[2];
    // No step can leave more than the piece itself, which matters when a saw of Advisor's plan is unknown.
    const stages=stageWeights(s,r,cuts);
    for(const k of ['WeightAfterTable','WeightAfterSaw','WeightAfterBruting','WeightAfterCrown','WeightAfterConing','WeightAfterPavil','Culet(%)'])if(+stages[k]>+part)stages[k]=part;
    return{...base,...csvStone(r),WT:part,PartWT:part,...stages,Color:s.fields['Stone.color']||'D',Clarity:!s.ownPlan&&list.length===1?s.fields['Stone.clarity']||'':'','Total Dolar':'0.0',Dolar:'0',PartName:i+1,
      'SW(%)':saw?(loss[i]/s.rough*100).toFixed(1):'','SW(MM)':saw?width.toFixed(0):'',SawWeightCarat:saw?loss[i].toFixed(3):'',
      saw:own<0?'':sawName(own),SawName:own<0?'':sawName(own),UserName:saw?sawName(i):'',Tilt:Math.round(deg(Math.acos(Math.max(-1,Math.min(1,along))))),'Culet(MM)':'0.0'};
  });
  const filler=loss.length?loss[0].toFixed(3):'',lines=[CSV_HEADER.join(',')];
  for(let i=0;i<CSV_ROWS;i++){
    const row=rows[i]||{...base,SawWeightCarat:i>=CSV_FILLER_FROM?filler:''};
    lines.push(CSV_HEADER.map(h=>row[h]??'').join(','));
  }
  return lines.join('\r\n')+'\r\n';
}
let exportFolder=null,stoneFolder=null,outputFolder=null;
// Folders are kept in the browser so they stay chosen after the page is closed.
function folderStore(mode,use){
  return new Promise(done=>{
    let open;
    try{open=indexedDB.open('adv-viewer',1)}catch{done(null);return}
    open.onupgradeneeded=()=>open.result.createObjectStore('folders');
    open.onerror=()=>done(null);
    open.onsuccess=()=>{
      const db=open.result,tx=db.transaction('folders',mode),q=use(tx.objectStore('folders'));
      tx.oncomplete=()=>{db.close();done(q.result)};
      tx.onerror=tx.onabort=()=>{db.close();done(null)};
    };
  });
}
function showFolders(){
  $('exportFolder').textContent=exportFolder?`Export folder: ${exportFolder.name}`:'Export folder';
  $('stoneFolder').textContent=stoneFolder?`Stone folder: ${stoneFolder.name}`:'Stone folder';
}
async function restoreFolders(){
  exportFolder=await folderStore('readonly',f=>f.get('export'))||null;
  stoneFolder=await folderStore('readonly',f=>f.get('stone'))||null;
  outputFolder=await folderStore('readonly',f=>f.get('output'))||null;
  showFolders();
}
async function canWrite(folder){
  if(!folder.queryPermission)return true;
  if(await folder.queryPermission({mode:'readwrite'})==='granted')return true;
  return await folder.requestPermission({mode:'readwrite'})==='granted';
}
async function chooseFolder(kind){
  if(!window.showDirectoryPicker){$('fitInfo').textContent='This browser cannot choose folders. Use a recent Chrome or Edge.';return}
  let folder;
  try{folder=await showDirectoryPicker({mode:'readwrite'})}
  catch(e){
    if(e.name!=='AbortError'){$('fitInfo').textContent=`Folder window failed: ${e.message}`;if($('bulkDialog').open)$('bulkNote').textContent=$('fitInfo').textContent}
    return;
  }
  if(kind==='stone')stoneFolder=folder;else if(kind==='output')outputFolder=folder;else exportFolder=folder;
  await folderStore('readwrite',f=>f.put(folder,kind));
  showFolders();
}
async function exportCsv(s){
  const text=buildCsv(s),name=`${s.name}.csv`;
  if(exportFolder&&await canWrite(exportFolder)){
    const file=await(await exportFolder.getFileHandle(name,{create:true})).createWritable();
    await file.write(text);await file.close();
    return`${name} written to ${exportFolder.name}`;
  }
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/csv'}));
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  return`${name} sent to Downloads`;
}
