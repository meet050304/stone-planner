// Writing .adv files: our stones, proportions, saws and every copy Advisor keeps.
'use strict';
// Builds a changed copy of the stone file, always the same length as the original. Advisor keeps
// repeated copies of plan data, so every identical copy of a record is updated together.
// A summary value sits after its name and a marker: the number, a rounded whole number, then the same value as text.
const SUMMARY_MARK=Uint8Array.from('bdf96b8de22c8c448fb482e2e32824d8'.match(/../g).map(x=>parseInt(x,16)));
function summarySlot(u8,dv,tail,key){
  const at=findAll(u8.subarray(tail),ascii(key))[0];
  if(at===undefined)return null;
  const from=tail+at+key.length,mark=findAll(u8.subarray(from,from+80),SUMMARY_MARK)[0];
  if(mark===undefined)return null;
  const q=from+mark+SUMMARY_MARK.length;
  return dv.getUint32(q+8,true)===2?q+16:null;
}
function writeSummary(s,u8,dv,list,base){
  const tail=Math.max(0,u8.length-3e6);
  const put=(key,value)=>{
    const q=summarySlot(u8,dv,tail,key);
    if(q===null)return 0;
    dv.setFloat64(q,value,true);dv.setInt32(q-4,Math.round(value),true);
    // The text keeps its length so nothing else in the file moves.
    const L=dv.getUint32(q+8,true),whole=String(Math.trunc(value)).length,digits=L-whole-1;
    if(digits>=0&&digits<=12)u8.set(ascii(value.toFixed(digits)),q+12);
    return 1;
  };
  const read=key=>{const q=summarySlot(u8,dv,tail,key);return q===null?null:dv.getFloat64(q,true)};
  const rows=buildCsv(s).split('\r\n').slice(1,1+list.length).map(l=>l.split(',')),WT=CSV_HEADER.indexOf('WT');
  const weights=list.map(stoneWeight),old=base.map(stoneWeight),free=list.map((_,i)=>i);
  let count=0;
  // Advisor numbers its results in its own order, so each is matched to the stone it described.
  for(let n=1;n<=list.length;n++){
    const was=read(`Result.${n}.PolishWeightDouble`);
    if(was===null)continue;
    const i=free.reduce((a,b)=>Math.abs(old[b]-was)<Math.abs(old[a]-was)?b:a);
    free.splice(free.indexOf(i),1);
    const polish=+weights[i].toFixed(3),part=+rows[i][WT];
    count+=put(`Result.${n}.PolishWeightDouble`,polish);
    count+=put(`Result.${n}.PartWeight`,part);
    if(part)count+=put(`Result.${n}.PartUsage`,+(polish/part*100).toFixed(2));
  }
  count+=put('Result.cur.TotalPolishWeight',+weights.reduce((a,b)=>a+b,0).toFixed(3));
  const depth=read('Result.Cur.TotalDepth_%');
  if(depth!==null){
    const totals=base.map(r=>stoneRows(r).total),i=totals.reduce((a,t,k)=>Math.abs(t-depth)<Math.abs(totals[a]-depth)?k:a,0);
    count+=put('Result.Cur.TotalDepth_%',stoneRows(list[i]).total);
  }
  return count;
}
function replaceAll(u8,from,to){
  let count=0;
  for(const at of findAll(u8,from)){u8.set(to,at);count++}
  return count;
}
function setDoubles(bytes,values){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(const [at,v] of values)dv.setFloat64(at,v,true);
}
// The file holds one state per inclusion, so a split one takes the strictest state of its parts.
function writeStates(s,u8){
  const wanted=new Map();
  for(const i of s.inclusions){
    if(i.stateAt===undefined)continue;
    const mode=i.ignored?0:i.auto?2:1,had=wanted.get(i.stateAt);
    wanted.set(i.stateAt,had===1||mode===1?1:Math.max(had||0,mode));
  }
  let states=0;
  for(const [at,next] of wanted){
    if(next!==u8[at])states++;
    u8[at]=next;
  }
  return states;
}
async function buildAdv(s){
  const original=new Uint8Array(await s.file.arrayBuffer()),u8=original.slice(),dv=new DataView(u8.buffer),done=[];
  done.push(`${writeStates(s,u8)} inclusion changes`);
  const list=activeStones(s),base=s.plannedStones,sameCount=list.length===base.length;
  // A saw cuts only the part its 'within' planes keep (a second saw cuts what the first leaves). Its role is the stones
  // of that part and how it divides them, by stone number.
  const dot=(n,c)=>n[0]*c[0]+n[1]*c[1]+n[2]*c[2];
  const role=(w,cs)=>{
    const part=cs.map((c,i)=>i).filter(i=>(w.within||[]).every(p=>dot(p,cs[i])>=p[3]-1));
    const a=part.filter(i=>dot(w.normal,cs[i])>=w.offset),b=part.filter(i=>dot(w.normal,cs[i])<w.offset);
    return[a.join(),b.join()].sort().join('|');
  };
  const multi=sameCount&&s.ownPlan&&s.ownSaws?.length>1&&s.ownSaws.length===s.fileSaws?.length;
  if(multi){
    // Our stone i goes into the file's stone i. Take the stone order in which every saw of the file has a saw of ours
    // with the same role, so each stone stays in its part.
    const olds=s.fileSaws.map(w=>role(w,base.map(r=>r.center))).sort().join(' ');
    const orders=a=>a.length<2?[a]:a.flatMap((x,i)=>orders([...a.slice(0,i),...a.slice(i+1)]).map(o=>[x,...o]));
    const fit=orders(list.map((_,i)=>i)).find(o=>s.ownSaws.map(w=>role(w,o.map(i=>list[i].center))).sort().join(' ')===olds);
    if(fit){const re=fit.map(i=>list[i]);list.splice(0,list.length,...re)}
  }
  if(sameCount){
    const saw=s.ownPlan&&s.ownSaws?.length===1&&list.length===2?s.ownSaws[0]:null;
    list.forEach((r,i)=>{
      const q=base[i].q,head=original.slice(q-56,q+72),next=head.slice();
      setDoubles(next,[[0,r.angles[0]],[8,r.angles[1]],[16,r.angles[2]],[32,r.center[0]],[40,r.center[1]],[48,r.center[2]],[56,r.D]]);
      if(saw){
        const c=r.center,side=c[0]*saw.normal[0]+c[1]*saw.normal[1]+c[2]*saw.normal[2]>=saw.offset?1:-1;
        setDoubles(next,[[88,saw.normal[0]*side],[96,saw.normal[1]*side],[104,saw.normal[2]*side],[112,side*saw.offset+s.ownSawWidth/2],[120,s.ownSawWidth]]);
      }
      replaceAll(u8,head,next);
      const at=base[i].prop.at;
      if(at!==undefined){
        const block=original.slice(at,at+176),b=block.slice(),v=stoneRows(r),p=r.prop;
        // Fields 15, 16 and 21 follow from the others (star and lower-half tip height ratios, crown plus pavilion angle);
        // Advisor draws the facets from them, so left at the file's old values they reshape our stone.
        const c8=Math.cos(Math.PI/8),rs=p.table*c8+(1-p.table*c8)*p.star;
        setDoubles(b,[[0,p.girdle],[8,p.table],[16,rad(v.crownAngle)],[24,rad(v.pavAngle)],[32,p.crown],[40,p.pavilion],[48,p.crown+p.girdle+p.pavilion],
          [120,(1-rs*c8)/(1-p.table)],[128,1-(1-p.half)*c8],[136,p.star],[144,p.half],[168,rad(v.crownAngle)+rad(v.pavAngle)]]);
        replaceAll(u8,block,b);
        // Advisor keeps a second copy of each stone record further on in the file (not always byte for byte the same),
        // a second proportion block 256 bytes before each record's own block, and the old diameter in several more
        // places. It checks the stone against the rough with these, so all of them take our values.
        const odv=new DataView(original.buffer),fields=[0,1,2,3,4,5,6,15,16,17,18,21],bdv=new DataView(b.buffer);
        const near=(x,y)=>Math.abs(x-y)<=1e-6*Math.max(1,Math.abs(y)),old=base[i];
        // The record also holds the stone's volume (um3, 8 bytes after the diameter) and its weight (ct) in two more
        // places and in the header; Advisor shows and checks the stone with these, so every copy takes our values.
        const oldV=odv.getFloat64(q+8,true),oldW=oldV*1e-9*MEASURED_DENSITY/200,newV=stoneVolume(r),newW=stoneWeight(r);
        const same=(x,y)=>Math.abs(x-y)<=1e-9*Math.abs(y);
        if(oldV>1e6)for(let k=0;k+8<=original.length;k++){
          const x=odv.getFloat64(k,true);
          if(same(x,oldV))dv.setFloat64(k,newV,true);else if(same(x,oldW))dv.setFloat64(k,newW,true);
        }
        for(let k=56;k+8<=original.length;k++){
          if(!near(odv.getFloat64(k,true),old.D))continue;
          if([0,1,2].every(j=>near(odv.getFloat64(k-24+8*j,true),old.center[j])&&near(odv.getFloat64(k-56+8*j,true),old.angles[j]))){
            [0,1,2].forEach(j=>{dv.setFloat64(k-56+8*j,r.angles[j],true);dv.setFloat64(k-24+8*j,r.center[j],true)});
            if(saw)for(let j=0;j<5;j++)dv.setFloat64(k+32+8*j,new DataView(next.buffer).getFloat64(88+8*j,true),true);
            for(const c of [k+at-q,k+at-q-256])if(c>=0&&fields.every(f=>near(odv.getFloat64(c+8*f,true),odv.getFloat64(at+8*f,true))))fields.forEach(f=>dv.setFloat64(c+8*f,bdv.getFloat64(8*f,true),true));
            // The polish record before the stone holds the stone's turn as a 3x3 matrix Rz(c) Rx(b) and as the angles b, c.
            const turn=([,b2,c2])=>[Math.cos(c2),-Math.sin(c2)*Math.cos(b2),Math.sin(c2)*Math.sin(b2),Math.sin(c2),Math.cos(c2)*Math.cos(b2),-Math.cos(c2)*Math.sin(b2),0,Math.sin(b2),Math.cos(b2)];
            const was=turn(old.angles),now=turn(r.angles);
            for(let j=Math.max(0,k-2200);j<k-72;j++){
              if(was.every((x,m)=>near(odv.getFloat64(j+8*m,true),x)))now.forEach((x,m)=>dv.setFloat64(j+8*m,x,true));
              if(near(odv.getFloat64(j,true),old.angles[1])&&near(odv.getFloat64(j+8,true),old.angles[2])){dv.setFloat64(j,r.angles[1],true);dv.setFloat64(j+8,r.angles[2],true)}
            }
          }
          dv.setFloat64(k,r.D,true);
        }
      }
    });
    done.push(`${writeSummary(s,u8,dv,list,base)} summary values`);
    // The header's per-stone weights (104 on) follow Advisor's result order; they were replaced above with each
    // stone's old weight, so only the total is set here.
    dv.setFloat64(76,list.map(stoneWeight).reduce((a,b)=>a+b,0),true);
    done.push(`${list.length} stones`);
    if(saw){const n=sawPlates(s,u8,saw);done.push(`saw (${n.places} places, ${n.numbers} positions)`)}
    else if(multi){
      // Each file saw takes our saw with the same role, turned so that every stone of its part keeps its side.
      const oc=base.map(r=>r.center),nc=list.map(r=>r.center),used=new Set();let places=0,missing=0;
      s.fileSaws.forEach(old=>{
        const key=role(old,oc),j=s.ownSaws.findIndex((w,j)=>!used.has(j)&&role(w,nc)===key);
        if(j<0){missing++;return}
        used.add(j);const w=s.ownSaws[j];
        const i=oc.map((c,i)=>i).find(i=>(old.within||[]).every(p=>dot(p,oc[i])>=p[3]-1))??0;
        const turn=Math.sign(dot(old.normal,oc[i])-old.offset)===Math.sign(dot(w.normal,nc[i])-w.offset)?1:-1;
        places+=sawPlates(s,u8,w,old,turn).places;
      });
      done.push(`${s.ownSaws.length} saws (${places} places${missing?`, ${missing} saw${missing>1?'s':''} not matched, left as in the file`:''})`);
    }
  }
  return{bytes:u8,done,sameCount,planned:list.length,fileStones:base.length};
}
// Advisor draws the saw from its plate records (SawN-k) and cuts the parts with the same plane in the part
// records, not with the planes kept with each stone. Every place that holds the file's own saw direction (by value)
// takes the new direction, keeping the old one's sign, and the numbers just around it that hold the saw's centre,
// either face or the thickness take the new ones. In plate records a byte short these sit one byte nearer.
function sawPlates(s,u8,saw,old=s.fileSaws?.[0],turn=null){
  if(!old)return{places:0,numbers:0};
  const width=s.ownSawWidth,flip=turn??(saw.normal[0]*old.normal[0]+saw.normal[1]*old.normal[1]+saw.normal[2]*old.normal[2]<0?-1:1);
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.length),c0=old.offset,c1=flip*saw.offset;
  const swap=[[c0,c1],[c0+old.width/2,c1+width/2],[c0-old.width/2,c1-width/2],[old.width,width]];
  const key=new Uint8Array(8);new DataView(key.buffer).setFloat64(0,old.normal[0],true);
  let places=0,numbers=0;
  for(const hit of findAll(u8,key.subarray(4))){
    const n=hit-4;
    if(n<40||n+64>u8.length||![0,1,2].every(i=>Math.abs(dv.getFloat64(n+8*i,true)-old.normal[i])<1e-6))continue;
    [0,1,2].forEach(i=>dv.setFloat64(n+8*i,flip*saw.normal[i],true));places++;
    for(const p of [n-24,n-23,n-16,n-15,n+24,n+32]){
      const v=dv.getFloat64(p,true),m=swap.find(([o])=>Math.abs(v-o)<1e-6);
      if(m){dv.setFloat64(p,m[1],true);numbers++}
    }
  }
  return{places,numbers};
}
// Saves over the stone's file in the Stone folder. Its size never changes, so frames stay where they are.
async function overwriteAdv(s,bytes,folder=stoneFolder){
  const name=s.file.name,copy=folder!==stoneFolder;
  let handle;
  try{handle=await folder.getFileHandle(name,{create:copy})}catch{throw new Error(`${name} is not in the folder ${folder.name}. Choose the folder that holds it.`)}
  if(!copy&&(await handle.getFile()).size!==bytes.length)throw new Error(`${name} in ${folder.name} is a different file, so it was not replaced.`);
  const out=await handle.createWritable();
  await out.write(bytes);await out.close();
  // A copy in the output folder leaves the original open and unchanged.
  if(copy)return;
  s.file=await handle.getFile();
  if(s.file.size!==bytes.length)throw new Error(`Writing ${name} failed.`);
  // Images were opened from the old file, so they are opened again from the new one.
  releaseUrls();releasePhotos();galleryFor=null;shownPhoto=null;
}
async function saveNewAdv(){
  const s=stones[current];if(!s)return;
  if(window.showDirectoryPicker&&!stoneFolder)await chooseFolder('stone');
  if(!window.showDirectoryPicker||!stoneFolder||!await canWrite(stoneFolder)){
    if(window.showDirectoryPicker){$('fitInfo').textContent='Not saved: no Stone folder chosen.';return}
    $('fitInfo').textContent='This browser cannot replace files. Use a recent Chrome or Edge.';return;
  }
  $('fitInfo').textContent='Saving .adv…';
  try{$('fitInfo').textContent=await saveStone(s)}
  catch(e){$('fitInfo').textContent=`Not saved: ${e.message}`}
}
async function saveStone(s,folder=stoneFolder){
  const r=await buildAdv(s),changed=!!s.plannedStones.length;
  // A stone with no plan yet has nowhere in the file to hold one, so its file is left as it is.
  if(changed||folder!==stoneFolder)await overwriteAdv(s,r.bytes,folder);
  if(r.sameCount&&folder===stoneFolder)activeStones(s).forEach((x,i)=>{
    const base=s.plannedStones[i];
    Object.assign(base,{D:x.D,center:x.center,angles:x.angles,mesh:x.mesh,prop:{...x.prop,at:base.prop.at}});
  });
  const exported=await exportCsv(s);
  showFrame();
  let kept='';
  if(!r.sameCount){
    // A different number of stones cannot go inside the .adv, so the plan is kept beside it.
    const name=`${s.name}.plan.json`,out=await(await folder.getFileHandle(name,{create:true})).createWritable();
    await out.write(JSON.stringify(planFor(s),null,1));await out.close();
    kept=` This ${r.planned} stone plan cannot go inside the .adv, which holds ${r.fileStones}: it is in ${name} and the CSV.`;
  }
  return`Saved ${s.file.name}: ${r.done.join(', ')}.${kept} ${exported}.`;
}
