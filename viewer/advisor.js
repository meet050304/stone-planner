// Advisor run: Advisor makes the final plans, so every stone obeys its rules; our planner only decides.
// Step 1 here writes copies into the Work folder: our inclusion choices, and where it fits, a copy with our best saw.
// Step 2 is advisor-automation/advisor-best-plan.ps1 on the Advisor PC, which saves each kind of plan to the Saves folder.
// Step 3 here prices every save and copies the most profitable one to the Final folder.
'use strict';
const ADV_KINDS={MK:'Makeable',BP:'Best Pair',BR:'Best Pair + Best Remainder',MP:'MultiPlan',SAW:'Our saw + Both'};
const ADV_PREPARED='advisor-prepare.json';
const advFolders={stone:null,work:null,saves:null,final:null};
const isAdv=name=>/\.adv$/i.test(name)&&!name.startsWith('._');
const baseName=name=>name.replace(/\.adv$/i,'');
function showAdvFolders(){
  for(const [kind,id] of [['stone','advStone'],['work','advWork'],['saves','advSaves'],['final','advFinal']])$(id).textContent=advFolders[kind]?.name||'Not chosen';
  const {stone,work,saves,final}=advFolders;
  $('advPrepare').disabled=!(stone&&work);
  $('advPick').disabled=!(work&&saves&&final);
}
async function advisorRun(){
  if(bulkRunning)return;
  if(!window.showDirectoryPicker){$('fitInfo').textContent='This browser cannot choose folders. Use a recent Chrome or Edge.';return}
  for(const kind of Object.keys(advFolders))advFolders[kind]=advFolders[kind]||await folderStore('readonly',f=>f.get('adv-'+kind))||null;
  $('advNote').textContent='Originals in the Stone folder are only read.';
  showAdvFolders();
  $('advisorDialog').showModal();
}
async function chooseAdvFolder(kind){
  let folder;
  try{folder=await window.showDirectoryPicker({id:'adv-'+kind,mode:kind==='stone'?'read':'readwrite'})}
  catch(e){if(e.name!=='AbortError')$('advNote').textContent=`Folder window failed: ${e.message}`;return}
  advFolders[kind]=folder;
  await folderStore('readwrite',f=>f.put(folder,'adv-'+kind));
  showAdvFolders();
}
async function advFiles(folder){
  const list=[];
  for await(const [name,entry] of folder.entries())if(entry.kind==='file'&&isAdv(name))list.push(entry);
  return list.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
async function writeFile(folder,name,data){
  const out=await(await folder.getFileHandle(name,{create:true})).createWritable();
  await out.write(data);await out.close();
}
// A trial takes stones spread evenly through the folder, not just its first ones.
const spread=(list,n)=>!n||n>=list.length?list:Array.from({length:n},(_,i)=>list[Math.floor(i*list.length/n)]);
// Advisor's stones as the file holds them: each weight comes from the stored volume, as Advisor's own does.
async function planFacts(s){
  const dv=new DataView(await s.file.arrayBuffer()),rates=profitSettings();
  const below=Math.round((rates.blockFrom-.005)*1000)-1,above=Math.round((rates.blockTo+.005)*1000);
  const stonesHeld=s.plannedStones.map(r=>{
    const V=dv.getFloat64(r.q+8,true),ct=V>1e6?V*1e-9*MEASURED_DENSITY/200:stoneWeight(r);
    return{D:r.D,ct,profit:stoneMoney(r.D,ct,rates).profit};
  });
  return{count:stonesHeld.length,sizes:stonesHeld.map(r=>(r.D/1000).toFixed(3)).join(' + '),ct:stonesHeld.reduce((a,r)=>a+r.ct,0),
    profit:stonesHeld.reduce((a,r)=>a+r.profit,0),blocked:stonesHeld.some(r=>r.D>below&&r.D<above)};
}
function showAdvReport(title,head,rows){
  $('bulkReport').hidden=false;
  $('bulkReport').innerHTML=`<p><b>${esc(title)}</b></p><table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
// Step 1. The stone's plan stays Advisor's; only the inclusion states change, so Advisor fits to our choices.
async function prepareStone(handle,work){
  const file=await handle.getFile(),s=await openAdv(file),row={file:file.name,name:baseName(file.name)};
  if(!s.stone?.tris.length)throw new Error('no rough model in this file');
  row.advisor=await planFacts(s);
  autoPicks(s);
  const u8=new Uint8Array(await file.arrayBuffer());
  row.changes=writeStates(s,u8);
  await writeFile(work,file.name,u8);
  const plans=await autoPlanRows(s),good=plans.filter(r=>r.stones.length);
  if(!good.length){row.note='Our planner found no profitable plan';return row}
  const best=good.reduce((a,b)=>b.profit>a.profit?b:a);
  row.planner={count:best.stones.length,sizes:best.stones.map(o=>(o.D/1000).toFixed(3)).join(' + '),profit:best.profit};
  // Our saw goes in only if the file has the same stones and saws to hold it. Advisor refits the stones after this.
  const stonesIn=s.plannedStones.length,sawsIn=s.fileSaws?.length||0;
  const fits=plans.filter(r=>sawsIn&&r.stones.length===stonesIn&&r.saws.length===sawsIn).sort((a,b)=>b.profit-a.profit)[0];
  if(fits){
    showOwnPlan(s,fits.stones,fits.saws,fits.sawWidth);
    const built=await buildAdv(s);
    if(built.done.some(d=>d.includes('not matched')))row.note='No saw copy: a saw could not be matched';
    else{await writeFile(work,`${row.name}-OURSAW.adv`,built.bytes);row.sawCopy=true}
  }else row.note=sawsIn?`No saw copy: our plan with ${stonesIn} stones and ${sawsIn} saw${sawsIn>1?'s':''} was not found`:'No saw copy: the file has no saw';
  return row;
}
async function prepareForAdvisor(){
  const {stone,work}=advFolders,n=Math.max(0,parseInt($('advCount').value,10)||0);
  if(await stone.isSameEntry(work)){$('advNote').textContent='The Work folder must be different from the Stone folder.';return}
  if(!await canWrite(work)){$('advNote').textContent='Folder access was not allowed.';return}
  if(!limitsUsable()){$('advNote').textContent='Cut limits cannot be met. Check the Cut limits tab.';return}
  const handles=spread(await advFiles(stone),n);
  if(!handles.length){$('advNote').textContent=`No .adv files in ${stone.name}.`;return}
  $('advisorDialog').close();
  bulkRunning=true;
  const done=[],status=()=>showAdvReport(`Preparing: ${done.length} of ${handles.length} done`,['Stone','Inclusion changes','Our plan','Our profit','Advisor profit','Saw copy'],
    done.map(r=>[r.name,r.changes??'—',r.planner?.sizes||'—',r.planner?rupees(r.planner.profit):'—',r.advisor?rupees(r.advisor.profit):'—',r.sawCopy?'Yes':r.note||'—']));
  status();
  let next=0;
  const lane=async()=>{
    while(next<handles.length){
      const handle=handles[next++];
      let row;
      try{row=await prepareStone(handle,work)}catch(e){row={file:handle.name,name:baseName(handle.name),note:`Failed: ${e.message}`}}
      done.push(row);status();
      await writeFile(work,ADV_PREPARED,JSON.stringify(done,null,1));
    }
  };
  await Promise.all(Array.from({length:BULK_STONES},lane));
  bulkRunning=false;
  showAdvReport(`Prepared ${done.filter(r=>r.changes!==undefined).length} of ${handles.length} stones in ${work.name}. Next: run advisor-best-plan on the Advisor PC.`,['Stone','Inclusion changes','Our plan','Our profit','Advisor profit','Saw copy'],
    done.map(r=>[r.name,r.changes??'—',r.planner?.sizes||'—',r.planner?rupees(r.planner.profit):'—',r.advisor?rupees(r.advisor.profit):'—',r.sawCopy?'Yes':r.note||'—']));
}
// Step 3. Saves are named [stone]-MK, -BP, -BR, -MP and -SAW. A blocked size or a wrong stone count is kept out of the choice.
async function pickBestSaves(){
  const {work,saves,final}=advFolders;
  if(await saves.isSameEntry(final)){$('advNote').textContent='The Final folder must be different from the Saves folder.';return}
  if(!await canWrite(final)){$('advNote').textContent='Folder access was not allowed.';return}
  let prepared=[];
  try{prepared=JSON.parse(await(await(await work.getFileHandle(ADV_PREPARED)).getFile()).text())}
  catch{$('advNote').textContent=`${ADV_PREPARED} is not in ${work.name}. Prepare copies first.`;return}
  const groups=new Map;
  for(const handle of await advFiles(saves)){
    const m=baseName(handle.name).match(/^(.*)-(MK|BP|BR|MP|SAW)$/);
    if(!m)continue;
    if(!groups.has(m[1]))groups.set(m[1],[]);
    groups.get(m[1]).push({handle,kind:m[2]});
  }
  if(!groups.size){$('advNote').textContent=`No saves named like [stone]-MK.adv in ${saves.name}.`;return}
  $('advisorDialog').close();
  const kinds=Object.keys(ADV_KINDS),lines=[],shown=[];
  const head=['Stone','Advisor alone','Our planner',...kinds,'Winner','Stones','Sizes (mm)','Profit','Rough cost','Net profit','Note'];
  const known=new Map(prepared.map(r=>[r.name,r]));
  for(const [name,list] of groups){
    showAdvReport(`Reading saves: ${shown.length} of ${groups.size} stones done`,head,shown);
    const was=known.get(name),found=[],notes=[];let cost=0;
    for(const c of list){
      try{
        const file=await c.handle.getFile(),s=await openAdv(file),facts=await planFacts(s);cost=roughCost(s);
        found.push({...c,...facts});
        if(!facts.count)notes.push(`${c.kind} holds no stone`);
        else if(facts.blocked)notes.push(`${c.kind} has a blocked size`);
        else if((c.kind==='BP'&&facts.count!==2)||(c.kind==='BR'&&facts.count<3))notes.push(`${c.kind} saved ${facts.count} stone${facts.count>1?'s':''}`);
      }catch(e){notes.push(`${c.kind} failed: ${e.message}`)}
    }
    const usable=found.filter(c=>c.count&&!c.blocked),win=usable.length?usable.reduce((a,b)=>b.profit>a.profit?b:a):null;
    if(win){
      await writeFile(final,`${name}.adv`,await win.handle.getFile());
      if(was?.advisor&&win.profit<was.advisor.profit)notes.push('Advisor\'s original plan earned more');
    }else notes.push('No usable save, nothing copied');
    const money=v=>v===undefined?'':Math.round(v);
    lines.push([name,money(was?.advisor?.profit),money(was?.planner?.profit),...kinds.map(k=>money(found.find(c=>c.kind===k)?.profit)),win?.kind||'',win?.count||'',win?`"${win.sizes}"`:'',money(win?.profit),money(cost),money(win?win.profit-cost:undefined),`"${notes.join('; ')}"`].join(','));
    shown.push([name,was?.advisor?rupees(was.advisor.profit):'—',was?.planner?rupees(was.planner.profit):'—',...kinds.map(k=>{const c=found.find(x=>x.kind===k);return c?rupees(c.profit):'—'}),win?.kind||'—',win?.count||'—',win?.sizes||'—',win?rupees(win.profit):'—',rupees(cost),win?rupees(win.profit-cost):'—',notes.join('; ')]);
    await writeFile(final,'advisor-best.csv',[head.join(','),...lines].join('\r\n')+'\r\n');
  }
  showAdvReport(`Finished: ${shown.filter(r=>r[3+kinds.length]!=='—').length} of ${groups.size} stones copied to ${final.name}. Log: advisor-best.csv`,head,shown);
  $('bulkReport').scrollIntoView({block:'nearest'});
}
