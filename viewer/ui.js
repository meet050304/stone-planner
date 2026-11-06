// Settings, cut limits, details, and the buttons and keys of the page (loaded last).
'use strict';
/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
const ct=v=>v?v.toFixed(3)+' ct':'—';
const pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'—';
const num=v=>Number.isFinite(v)?v.toLocaleString():'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');

function renderList(){
  $('stones').replaceChildren(...stones.map((s,i)=>{
    const b=document.createElement('button');b.className='stone'+(s.error?' err':'');
    b.setAttribute('aria-current',i===current);
    b.innerHTML=`${esc(s.name)}<small>${s.error?esc(s.error):`${ct(s.rough)} rough · ${pct(s.polished,s.rough)}`}</small>`;
    if(!s.error)b.onclick=()=>select(i);
    return b;
  }));
}
function select(i){
  if(current!==i){showOnly(null);releaseUrls();releasePhotos();galleryFor=null;shownPhoto=null;resetScanView();clearFit()}
  current=i;const s=stones[i];
  $('empty').hidden=true;$('empty').style.display='none';$('view').hidden=false;
  $('title').textContent=s.name;
  $('sub').textContent=`Saved ${s.saved.toLocaleString()} · ${s.file.name}`;
  $('stats').innerHTML=[
    // Advisor saves these weights to 3 decimals only, so they differ a little from the weights worked out from the stones.
    ['Rough',ct(s.rough)],['Polished saved by Advisor',ct(s.polished)],['Saved yield',pct(s.polished,s.rough)],
    ['Polished stones',s.parts.length||'—'],['Inclusions',num(s.incTotal)],['Scan images',s.frames.length]
  ].map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  if(!s.picksRestored){autoPicks(s);restorePicks(s);s.picksRestored=true}
  upload(s);
  showPicks();
  renderDetails(s);
  renderPlan(s);renderCompare();renderList();setTab(tab);
  showDim(s);
  showFrame();
  render();
}
function showDim(s){
  const bb=s.stone&&bbox(s.stone);
  $('dim').textContent=bb?`${bb.hi.map((h,k)=>((h-bb.lo[k])/1000).toFixed(2)).join(' × ')} mm · ${num(s.drawnInclusions)} of ${num(s.incTotal)} inclusions (${num(s.inclusions.length)} pieces) · ${s.plannedStones.length} planned stones`:'No stone model found';
}
// Starting values are MARUTI, ROUND, V.G. from Advisor's grading screen. Percent, or degrees for angles.
const LIMIT_ROWS=[
  ['girdle','Girdle thickness',3,3.5],['table','Table size',58,62],['crownAngle','Crown angle',34.5,36.5],
  ['pavAngle','Pavilion angle',41.1,41.7],['crown','Crown height',14.5,16],['pavilion','Pavilion depth',42.5,44],
  ['total','Total depth',60,64],['star','Star length',50,60],['half','Lower half',75,85]
];
const defaultLimits=()=>Object.fromEntries(LIMIT_ROWS.map(([k,,a,b])=>[k,[a,b]]));
let limits=loadLimits();
function loadLimits(){
  try{return{...defaultLimits(),...JSON.parse(localStorage.getItem('adv-cut-limits')||'{}')}}
  catch{return defaultLimits()}
}
function saveLimits(){try{localStorage.setItem('adv-cut-limits',JSON.stringify(limits))}catch{}}
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
// CrownInc from the INCLUSION LIST: CROWN+ less 30, by the program's chId, rough carats x 100 rounded down.
const CROWN_INC=[70,70,230,240,250,340,340,340,290,290,350,370,380,390,400,410,420,420,420,420];
const crownInc=ct=>CROWN_INC[Math.min(CROWN_INC.length-1,Math.max(0,Math.floor(ct*100+1e-9)))];
// INCLUSION LIST MIN-MICRON: 20 for rough up to the 0.05 row, 40 above.
const minMicron=ct=>Math.floor(ct*100+1e-9)<=4?20:40;
// TableInc: TABLE CTR+ plus 1. From TIK-IGNORE up to here an Auto inclusion may sit under the table; above it, only under the crown.
const TABLE_INC=[51,51,151,151,251,331,351,361,241,231,371,381,391,401,411,421,431,441,451,461];
const tableInc=ct=>TABLE_INC[Math.min(TABLE_INC.length-1,Math.max(0,Math.floor(ct*100+1e-9)))];
// Diagonal across the two longest box sides, for one inclusion or its joined pieces.
function boxSize(list){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const i of list){const P=i.mesh.pos;for(const v of new Set(i.mesh.tris))for(let k=0;k<3;k++){const c=P[v*3+k];if(c<lo[k])lo[k]=c;if(c>hi[k])hi[k]=c}}
  const sides=hi.map((v,k)=>v-lo[k]).sort((a,b)=>b-a);
  return Math.hypot(sides[0],sides[1]);
}
// Values kept from before these defaults (safety 0, rough safety 0) go, once, so a browser starts from ours.
try{if(!localStorage.getItem('adv-our-safety-2')){for(const key of ['adv-rough-safety','adv-pit-safety'])localStorage.removeItem(key);localStorage.setItem('adv-our-safety-2','1')}}catch{}
const DEFAULT_SAW=25,DEFAULT_SAFETY=10,DEFAULT_ROUGH_SAFETY=5,DEFAULT_PIN=0,DEFAULT_IGNORE_TO=201,DEFAULT_AUTO_FROM=202,DEFAULT_SKIN=100;
function numberSetting(key,max,fallback){
  let v=NaN;
  try{v=parseFloat(localStorage.getItem(key))}catch{}
  return v>=0&&v<=max?v:fallback;
}
const RATE_INPUTS=[['rateHigh','adv-rate-high','Price up to the size limit (₹ per carat)',1e7,22320],['rateLow','adv-rate-low','Price above the size limit (₹ per carat)',1e7,14415],
  ['rateLabour','adv-labour','Labour per polished stone (₹)',1e5,60],['rateLimit','adv-size-limit','Size limit after polishing (mm)',20,1.25],
  ['rateLoss','adv-loss','Weight lost in polishing (%)',50,3],['blockFrom','adv-block-from','Do not plan sizes from (mm)',20,1.26],['blockTo','adv-block-to','Do not plan sizes up to (mm)',20,1.33],
  ['rateRough','adv-rough-cost','Rough diamond cost (₹ per carat of rough)',1e8,0]];
function profitSettings(){
  const [high,low,labour,limit,loss,blockFrom,blockTo,rough]=RATE_INPUTS.map(([,key,,max,value])=>numberSetting(key,max,value));
  return{high,low,labour,limit,loss:loss/100,blockFrom,blockTo,rough};
}
// The rough is bought whole, so its cost is the same for every plan of a stone: it changes the money left, not which plan is best.
const roughCost=s=>(s.rough||0)*profitSettings().rough;
const profitForInputs=()=>RATE_INPUTS.map(([,key,,max,value])=>numberSetting(key,max,value));
function stoneMoney(D,ct,rates){
  const keep=1-rates.loss,size=D/1000*Math.cbrt(keep),price=size<=rates.limit?rates.high:rates.low,final=ct*keep,value=final*price;
  return{size,final,price,value,profit:value-rates.labour};
}
const pinSetting=()=>numberSetting('adv-pin-zone',25,DEFAULT_PIN),ignoreToSetting=()=>numberSetting('adv-ignore-to',5000,DEFAULT_IGNORE_TO),autoFromSetting=()=>numberSetting('adv-auto-from',5000,DEFAULT_AUTO_FROM),autoToSetting=s=>numberSetting('adv-auto-to',5000,Math.max(crownInc(s?.rough||0),tableInc(s?.rough||0))),skinSetting=()=>numberSetting('adv-skin',1000,DEFAULT_SKIN),minMicronSetting=()=>numberSetting('adv-min-micron',1,0),autoTableSetting=()=>numberSetting('adv-auto-table',1,0),autoCuletSetting=()=>numberSetting('adv-auto-culet',1,1),tableDepthSetting=()=>numberSetting('adv-table-depth',100,5),culetStartSetting=()=>numberSetting('adv-culet-start',100,78),culetLimitSetting=()=>numberSetting('adv-culet-limit',5000,100),culetBottomSetting=()=>numberSetting('adv-culet-bottom',100,10);
const rupees=v=>`₹${Math.round(v).toLocaleString('en-IN')}`;
// Saw plate by rough weight, from the user's INCLUSION LIST photo. The row is the program's chId, rough carats x 100
// rounded down, counted from 0, so 0.071 ct is row 7, the list's SIZE 0.08.
const PLATE_BY_ROW=[20,20,25,30,30,35,35,35,35,50];
const platePerRough=ct=>PLATE_BY_ROW[Math.min(PLATE_BY_ROW.length-1,Math.max(0,Math.floor(ct*100+1e-9)))];
// A value typed under Cut limits wins. Left empty, the plate follows the rough weight.
function sawSetting(s){
  let v=NaN;
  try{v=parseFloat(localStorage.getItem('adv-saw-width'))}catch{}
  if(v>=0&&v<=500)return v;
  return s?.rough>0?platePerRough(s.rough):DEFAULT_SAW;
}
function roughSafetySetting(){
  let v=NaN;
  try{v=parseFloat(localStorage.getItem('adv-rough-safety'))}catch{}
  return v>=0&&v<=200?v:DEFAULT_ROUGH_SAFETY;
}
function safetySetting(){
  let v=NaN;
  try{v=parseFloat(localStorage.getItem('adv-safety'))}catch{}
  return v>=0&&v<=200?v:DEFAULT_SAFETY;
}
// Advisor narrows the user's range because crown height follows from table and crown angle, pavilion
// depth from pavilion angle, and total depth is their sum. Repeating this settles the actual range.
function actualLimits(){
  const a=Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,[...v]]));
  const narrow=(k,lo,hi)=>{a[k][0]=Math.max(a[k][0],lo);a[k][1]=Math.min(a[k][1],hi)};
  for(let i=0;i<6;i++){
    const tan0=Math.tan(rad(a.crownAngle[0])),tan1=Math.tan(rad(a.crownAngle[1]));
    narrow('crown',tan0*(100-a.table[1])/2,tan1*(100-a.table[0])/2);
    narrow('table',100-2*a.crown[1]/tan0,100-2*a.crown[0]/tan1);
    narrow('crownAngle',deg(Math.atan(2*a.crown[0]/(100-a.table[0]))),deg(Math.atan(2*a.crown[1]/(100-a.table[1]))));
    narrow('pavilion',Math.tan(rad(a.pavAngle[0]))*50,Math.tan(rad(a.pavAngle[1]))*50);
    narrow('pavAngle',deg(Math.atan(a.pavilion[0]/50)),deg(Math.atan(a.pavilion[1]/50)));
    narrow('total',a.girdle[0]+a.crown[0]+a.pavilion[0],a.girdle[1]+a.crown[1]+a.pavilion[1]);
  }
  return a;
}
function limitsUsable(){return Object.values(actualLimits()).every(([lo,hi])=>lo<=hi+1e-9)}
// The real facets of a stone 1000 um across, unturned, for the worker's inclusion check.
const facetPlanes=p=>Float64Array.from(stonePlanes(brilliant({D:1000,angles:[0,0,0],center:[0,0,0]},p)).flat());
function makeCut(name,table,angle,pavAngle,girdle,star,half){
  const t=table/100,crown=Math.tan(rad(angle))*(1-t)/2,pavilion=Math.tan(rad(pavAngle))/2,p={name,table:t,crown,girdle:girdle/100,pavilion,star:star/100,half:half/100};
  p.k=stoneWeight({D:1000,angles:[0,0,0],center:[0,0,0],prop:p});
  p.planes=facetPlanes(p);
  p.corners=facetCorners(p);
  p.skin=facetSkin(p);
  return p;
}
const GIRDLE_REACH=1/Math.cos(Math.PI/16);
// The facet corners of a stone 1000 um across, unturned, in thousandths of the diameter, each corner once.
function facetCorners(p){
  const P=brilliant({D:1000,angles:[0,0,0],center:[0,0,0]},p).pos,seen=new Set(),out=[];
  for(let i=0;i<P.length;i+=3){
    const key=`${P[i].toFixed(3)},${P[i+1].toFixed(3)},${P[i+2].toFixed(3)}`;
    if(seen.has(key))continue;
    seen.add(key);out.push(P[i]/1000,P[i+1]/1000,P[i+2]/1000);
  }
  // Advisor's girdle reaches further than a circle: 16 corners at every 22.5 degrees, GIRDLE_REACH times the radius, at the
  // top and bottom of the girdle (416: Advisor's own stones then touch the rough, ours with a round girdle come 2 um out).
  for(let i=0;i<16;i++){const az=i*Math.PI/8,r=.5*GIRDLE_REACH;out.push(r*Math.cos(az),r*Math.sin(az),0,r*Math.cos(az),r*Math.sin(az),p.girdle)}
  return Float64Array.from(out);
}
// Points over every facet of a stone 1000 um across, unturned, in thousandths of the diameter, each with the
// facet's outward direction: the corners, the middle of each edge and the middle of each triangle of the facet.
function facetSkin(p){
  const m=brilliant({D:1000,angles:[0,0,0],center:[0,0,0]},p),P=m.pos,T=m.tris,seen=new Set(),out=[],mid=[0,0,0],n=P.length/3;
  for(let i=0;i<n;i++)for(let k=0;k<3;k++)mid[k]+=P[i*3+k]/n;
  const add=(q,f)=>{
    const key=q.map(e=>e.toFixed(2)).join()+'|'+f.map(e=>e.toFixed(3)).join();
    if(!seen.has(key)){seen.add(key);out.push(q[0]/1000,q[1]/1000,q[2]/1000,...f)}
  };
  for(let i=0;i<T.length;i+=3){
    const v=[0,1,2].map(j=>[0,1,2].map(k=>P[T[i+j]*3+k])),x=cross(v[1].map((e,k)=>e-v[0][k]),v[2].map((e,k)=>e-v[0][k]));
    if(Math.hypot(...x)<1e-9)continue;
    let f=unit(x);
    if(f[0]*(mid[0]-v[0][0])+f[1]*(mid[1]-v[0][1])+f[2]*(mid[2]-v[0][2])>0)f=f.map(e=>-e);
    for(let j=0;j<3;j++){add(v[j],f);add(v[j].map((e,k)=>(e+v[(j+1)%3][k])/2),f)}
    add(v[0].map((e,k)=>(e+v[1][k]+v[2][k])/3),f);
  }
  // Advisor's girdle corners (see facetCorners) keep the gap too, outward from the axis.
  for(let i=0;i<16;i++){const az=i*Math.PI/8,c=Math.cos(az),n=Math.sin(az);for(const z of [0,p.girdle*1000])add([500*GIRDLE_REACH*c,500*GIRDLE_REACH*n,z],[c,n,0])}
  return Float64Array.from(out);
}
function cutsFromLimits(){
  // Each stone may take any of these cuts, which span the Cut limits, so the search can trade table, angles and girdle for size.
  const a=actualLimits(),mid=r=>(r[0]+r[1])/2,ends=r=>r[0]===r[1]?[r[0]]:[r[0],r[1]],out=[];
  for(const table of [a.table[0],mid(a.table),a.table[1]])for(const angle of ends(a.crownAngle))for(const pav of ends(a.pavAngle))for(const girdle of ends(a.girdle))
    for(const [star,half] of [[mid(a.star),mid(a.half)],[a.star[0],a.half[0]],[a.star[1],a.half[1]]]){
      const c=makeCut(`table ${table.toFixed(1)}`,table,angle,pav,girdle,star,half),crown=c.crown*100,pavilion=c.pavilion*100,total=crown+pavilion+girdle;
      const inside=(v,r)=>v>=r[0]-1e-6&&v<=r[1]+1e-6;
      if(inside(crown,a.crown)&&inside(pavilion,a.pavilion)&&inside(total,a.total))out.push(c);
    }
  return out.length?out:[makeCut('middle',mid(a.table),mid(a.crownAngle),mid(a.pavAngle),mid(a.girdle),mid(a.star),mid(a.half))];
}
function renderLimits(){
  const a=actualLimits(),usable=limitsUsable(),f=v=>Number.isFinite(v)?+v.toFixed(3):'—';
  $('tab-limits').innerHTML=`<p class="sub"><b>MARUTI, ROUND, V.G.</b> · <span class="${usable?'ok':'bad'}">${usable?'OK: proportions will work':'These limits cannot be met together'}</span></p>
  <table id="limitTable"><thead><tr><th>Parameter</th><th>User minimum</th><th>User maximum</th><th class="n">Actual minimum</th><th class="n">Actual maximum</th></tr></thead><tbody>
  ${LIMIT_ROWS.map(([k,label])=>`<tr><td>${label}${k.endsWith('Angle')?' (°)':' (%)'}</td><td><input class="num" type="number" step="0.1" data-limit="${k}" data-end="0" value="${limits[k][0]}" aria-label="${label} minimum"></td><td><input class="num" type="number" step="0.1" data-limit="${k}" data-end="1" value="${limits[k][1]}" aria-label="${label} maximum"></td><td class="n" data-actual="${k}0">${f(a[k][0])}</td><td class="n" data-actual="${k}1">${f(a[k][1])}</td></tr>`).join('')}
  </tbody></table>
  <p style="margin-top:10px"><label>Saw plate thickness (µm) <input class="num" id="sawWidth" type="number" min="0" max="500" step="1" value="${(()=>{try{return localStorage.getItem('adv-saw-width')??''}catch{return''}})()}" placeholder="by rough" style="max-width:90px"></label> <small>Empty follows the rough weight: under 0.02 ct 20, under 0.03 ct 25, under 0.05 ct 30, under 0.09 ct 35, 0.09 ct and up 50.</small></p>
  <p style="margin-top:10px"><label>Safety distance (µm) <input class="num" id="safety" type="number" min="0" max="200" step="1" value="${safetySetting()}" style="max-width:90px"></label></p>
  <p style="margin-top:6px"><label>Rough safety (µm), every facet stays this far inside the rough <input class="num" id="roughSafety" type="number" min="0" max="200" step="1" value="${roughSafetySetting()}" style="max-width:90px"></label></p>
  <h3 style="margin-top:14px">Auto select steps</h3>
  <p class="muted">Every inclusion starts as Use. Green is Use, yellow is Auto, red is Ignore.</p>
  ${[['ignoreTo','Step 1: Ignore size from 0 up to (µm)',ignoreToSetting()],['autoFrom','Step 2: Auto size from (µm)',autoFromSetting()],['autoTo','Step 2: Auto size to (µm), empty follows the rough weight (the higher of CROWN+ less 30 and TABLE CTR+ plus 1), these can stay inside a stone',(()=>{try{return localStorage.getItem('adv-auto-to')??''}catch{return''}})()],['skin','Step 3: Back to Use if wholly within this distance of the surface (µm)',skinSetting()],['minMicron','Ignore inclusions in the skin smaller than MIN-MICRON (20, or 40 from the 0.06 row) (1 yes, 0 no)',minMicronSetting()],['autoTable','Keep Auto inclusions out of the table part, under the whole table (1 yes, 0 no; off because Advisor leaves them there)',autoTableSetting()],['autoCulet','Keep Auto inclusions out of the culet part (1 yes, 0 no)',autoCuletSetting()],['tableDepth','Table part reaches down to this % of the stone height (0 table, 100 culet)',tableDepthSetting()],['culetStart','Culet part starts at this % of the stone height',culetStartSetting()],['culetLimit','Nothing bigger than this in the bottom of the stone, in any category (µm, 3D size)',culetLimitSetting()],['culetBottom','Bottom of the stone for that rule (% of the stone height)',culetBottomSetting()]].map(([id,label,value])=>`<p style="margin-top:6px"><label>${label} <input class="num" id="${id}" type="number" min="0" step="1" value="${value}" style="max-width:90px"></label></p>`).join('')}
  <p style="margin-top:10px"><label>Pin mark zone at top and bottom (%) <input class="num" id="pinZone" type="number" min="0" max="25" step="1" value="${pinSetting()}" style="max-width:90px"></label></p>
  <h3 style="margin-top:14px">Auto plan prices</h3>
  ${RATE_INPUTS.map(([id,,label,max],i)=>`<p style="margin-top:6px"><label>${label} <input class="num" id="${id}" type="number" min="0" max="${max}" step="any" value="${Object.values(profitForInputs())[i]}" style="max-width:100px"></label></p>`).join('')}
  <p style="margin-top:10px"><button id="limitsReset">Reset to our values</button></p>
  <p class="muted">Fit stones 1 to 5 uses the actual range, this plate thickness and this safety distance. Use inclusions may sit the safety distance inside a stone's surface, because polishing removes that layer. Auto inclusions can stay anywhere inside. Press a number again after changing them.</p>`;
  $('limitsReset').onclick=()=>{
    limits=defaultLimits();saveLimits();
    for(const key of ['adv-saw-width','adv-safety','adv-rough-safety','adv-culet-limit','adv-culet-bottom',...RATE_INPUTS.map(r=>r[1])])try{localStorage.removeItem(key)}catch{}
    renderLimits();if(stones[current])renderDetails(stones[current]);
  };
  const keep=(id,key,max)=>{$(id).oninput=e=>{
    const v=parseFloat(e.target.value);
    if(e.target.value===''){try{localStorage.removeItem(key)}catch{}}
    else if(v>=0&&v<=max){try{localStorage.setItem(key,v)}catch{}}
  }};
  RATE_INPUTS.forEach(([id,key,,max])=>keep(id,key,max));
  keep('ignoreTo','adv-ignore-to',5000);keep('autoFrom','adv-auto-from',5000);keep('autoTo','adv-auto-to',5000);keep('skin','adv-skin',1000);keep('minMicron','adv-min-micron',1);keep('autoTable','adv-auto-table',1);keep('autoCulet','adv-auto-culet',1);keep('tableDepth','adv-table-depth',100);keep('culetStart','adv-culet-start',100);keep('culetLimit','adv-culet-limit',5000);keep('culetBottom','adv-culet-bottom',100);keep('pinZone','adv-pin-zone',25);
  $('sawWidth').oninput=e=>{
    const v=parseFloat(e.target.value);
    if(e.target.value===''){try{localStorage.removeItem('adv-saw-width')}catch{}}
    else if(v>=0&&v<=500){try{localStorage.setItem('adv-saw-width',v)}catch{}}
  };
  $('safety').oninput=e=>{
    const v=parseFloat(e.target.value);
    if(v>=0&&v<=200){try{localStorage.setItem('adv-safety',v)}catch{}}
  };
  $('roughSafety').oninput=e=>{
    const v=parseFloat(e.target.value);
    if(v>=0&&v<=200){try{localStorage.setItem('adv-rough-safety',v)}catch{}}
  };
}
function refreshActual(){
  const a=actualLimits();
  for(const [k] of LIMIT_ROWS)for(const e of [0,1]){const c=document.querySelector(`[data-actual="${k}${e}"]`);if(c)c.textContent=Number.isFinite(a[k][e])?+a[k][e].toFixed(3):'—'}
  const flag=document.querySelector('#tab-limits .sub span'),usable=limitsUsable();
  flag.className=usable?'ok':'bad';flag.textContent=usable?'OK: proportions will work':'These limits cannot be met together';
}
function stoneWeight(r){
  const m=brilliant(r,r.prop),p=m.pos,t=m.tris,n=p.length/3;let cx=0,cy=0,cz=0;
  for(let i=0;i<p.length;i+=3){cx+=p[i]/n;cy+=p[i+1]/n;cz+=p[i+2]/n}
  let v=0;
  for(let i=0;i<t.length;i+=3){
    const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3,ax=p[a]-cx,ay=p[a+1]-cy,az=p[a+2]-cz,bx=p[b]-cx,by=p[b+1]-cy,bz=p[b+2]-cz,dx=p[c]-cx,dy=p[c+1]-cy,dz=p[c+2]-cz;
    v+=Math.abs(ax*(by*dz-bz*dy)+ay*(bz*dx-bx*dz)+az*(bx*dy-by*dx));
  }
  return v/6/1e9*MEASURED_DENSITY/200;
}
// Advisor's density: each stone record holds its volume (um3) and weight (ct), and weight = volume x 1e-9 x 3.50874 / 200
// on every stone checked (1.S525-276, 5 Nov 2026).
const MEASURED_DENSITY=3.50874;
const stoneVolume=r=>stoneWeight(r)*200/MEASURED_DENSITY*1e9;
function stoneRows(r){
  const p=r.prop,D=r.D/1000;
  return{dia:D,table:p.table*100,crownAngle:deg(Math.atan(2*p.crown/(1-p.table))),pavAngle:deg(Math.atan(2*p.pavilion)),girdle:p.girdle*100,star:p.star*100,half:p.half*100,
    crown:p.crown*100,pavilion:p.pavilion*100,total:(p.crown+p.girdle+p.pavilion)*100};
}
function outOfLimit(k,v){const a=actualLimits()[k];return a&&(v<a[0]-.05||v>a[1]+.05)}
function partDerived(r){
  const v=stoneRows(r),ct=stoneWeight(r),m=stoneMoney(r.D,ct,profitSettings());
  return`Total ${v.total.toFixed(1)}% · crown ${v.crown.toFixed(1)}% · pavilion ${v.pavilion.toFixed(1)}%<br>Weight about ${ct.toFixed(4)} ct, after polishing ${m.final.toFixed(4)} ct, ${m.size.toFixed(2)} mm<br>${rupees(m.price)} per carat · value ${rupees(m.value)} · profit ${rupees(m.profit)}`;
}
function autoTable(s){
  if(!s.autoResults)return'';
  const best=Math.max(...s.autoResults.filter(r=>r.stones.length).map(r=>r.profit));
  return`<h3>Auto plan</h3><table><thead><tr><th>Stones</th><th>Sizes (mm)</th><th class="n">Profit</th></tr></thead><tbody>${s.autoResults.map(r=>{
    return r.stones.length?`<tr class="link" data-auto="${r.count}"><td>${r.count}${r.count===s.autoShown?' ●':''}</td><td>${r.stones.map(o=>(o.D/1000).toFixed(2)).join(', ')}${r.lost?.length?`, <s>${r.lost.map(o=>(o.D/1000).toFixed(2)).join(', ')}</s> <small>left out, does not pay its labour</small>`:''}${r.from?` <small>best pair came from the ${r.from} stone try</small>`:''}</td><td class="n">${r.profit===best?'<b>':''}${rupees(r.profit)}${r.profit===best?'</b>':''}</td></tr>`
      :`<tr><td>${r.count}</td><td colspan="2" class="muted">No profit</td></tr>`;
  }).join('')}</tbody></table>`;
}
function renderDetails(s){
  const box=$('details');renderAdvPanel(s);if(!s)return;
  const list=activeStones(s),bb=s.stone&&bbox(s.stone),[on,off]=pickCounts(s);
  const total=list.reduce((a,r)=>a+stoneWeight(r),0),source=s.ownPlan?'Fitted plan':'Advisor plan';
  const size=bb?bb.hi.map((h,k)=>((h-bb.lo[k])/1000).toFixed(2)).join(' × ')+' mm':'—';
  const field=(r,i,k,label,digits)=>{const v=stoneRows(r)[k];return`<label>${label}<input class="num${k!=='dia'&&outOfLimit(k,v)?' out':''}" type="number" step="${k==='dia'?0.01:0.1}" data-part="${i}" data-key="${k}" value="${v.toFixed(digits)}"></label>`};
  const rates=profitSettings(),earned=list.reduce((a,r)=>{const m=stoneMoney(r.D,stoneWeight(r),rates);return{value:a.value+m.value,profit:a.profit+m.profit}},{value:0,profit:0});
  box.innerHTML=`<h3>Stone</h3><dl>
    <dt>Name</dt><dd>${esc(s.name)}</dd><dt>Rough</dt><dd>${s.rough.toFixed(3)} ct</dd><dt>Size</dt><dd>${size}</dd>
    <dt>Selected</dt><dd>${on}</dd><dt>Ignored</dt><dd>${off}</dd><dt>Damaged data</dt><dd>${s.dropped||0}</dd></dl>
    <h3>${source}</h3><dl><dt>Stones</dt><dd>${list.length}</dd>${list.length>1?`<dt>Saw plate</dt><dd>${s.ownPlan?s.ownSawWidth:s.fileSawWidth} µm</dd>`:''}<dt>Polished</dt><dd>about ${total.toFixed(4)} ct</dd><dt>Yield</dt><dd>${s.rough?(total/s.rough*100).toFixed(1)+'%':'—'}</dd></dl>
    ${autoTable(s)}<dl><dt>Value</dt><dd>${rupees(earned.value)}</dd><dt>Labour</dt><dd>${rupees(earned.value-earned.profit)}</dd><dt>Profit</dt><dd><b>${rupees(earned.profit)}</b></dd><dt>Rough cost</dt><dd>${rupees(roughCost(s))}</dd><dt>Net profit</dt><dd><b>${rupees(earned.profit-roughCost(s))}</b></dd></dl>
    ${list.map((r,i)=>`<div class="part"><b data-only="${i}" class="${i===onlyStone?'only':''}" title="Click to show only this stone">Stone ${String.fromCharCode(65+i)}${r.prop.assumed?' (assumed proportions)':''}</b>
      ${field(r,i,'dia','Diameter (mm)',3)}${field(r,i,'table','Table (%)',1)}${field(r,i,'crownAngle','Crown (°)',2)}${field(r,i,'pavAngle','Pavilion (°)',2)}${field(r,i,'girdle','Girdle (%)',1)}${field(r,i,'star','Star (%)',1)}${field(r,i,'half','Lower half (%)',1)}
      <p class="muted" data-derived="${i}" style="margin:4px 0 0">${partDerived(r)}</p></div>`).join('')}
    <p class="muted" style="margin-top:8px">Red means outside the cut limits. Edits are not checked against the rough or saved.</p>`;
}
function editStone(s,i,key,value){
  const r=activeStones(s)[i],v=stoneRows(r);
  if(key==='dia')r.D=value*1000;else v[key]=value;
  const t=v.table/100;
  r.prop={...r.prop,table:t,girdle:v.girdle/100,star:v.star/100,half:v.half/100,crown:Math.tan(rad(v.crownAngle))*(1-t)/2,pavilion:Math.tan(rad(v.pavAngle))/2};
  r.mesh=brilliant(r,r.prop);
  uploadPlan(s);render();queueInset();
}
function renderPlan(s){
  const rows=s.parts.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.shape)}</td><td class="n">${p.weight.toFixed(3)}</td><td class="n">${p.polish.toFixed(3)}</td><td class="n">${p.usage.toFixed(1)}%</td></tr>`).join('');
  $('tab-plan').innerHTML=`
  <table><thead><tr><th>Part</th><th>Shape</th><th class="n">Part weight (ct)</th><th class="n">Polished (ct)</th><th class="n">Yield</th></tr></thead><tbody>${rows||'<tr><td colspan=5>No plan stored</td></tr>'}</tbody></table>
  <h3>Stored details</h3>
  <table><tbody>
  <tr><td>Total depth</td><td>${s.depth?s.depth.toFixed(2)+'%':'—'}</td></tr>
  <tr><td>Inclusions: used / auto / ignored</td><td>${num(s.incUse)} / ${num(s.incAuto)} / ${num(s.incIgnore)}</td></tr>
  <tr><td>Inclusion meshes in file</td><td>${num(s.meshCount)}</td></tr>
  <tr><td>Stone volume from model</td><td>${s.repaired?'Not available':`${s.volume.toFixed(2)} mm³ (about ${(s.volume*3.52/200).toFixed(3)} ct)`}</td></tr>
  <tr><td>Cut options saved</td><td>${s.options.names.length} saw and pie cuts; shapes: ${esc(s.options.shapes.join(', ')||'—')}</td></tr>
  <tr><td>Colour / clarity as stored</td><td>${esc(s.color||'—')} / ${esc(s.clarity||'—')}</td></tr>
  </tbody></table>
  ${s.incTotal>0&&s.clarity==='IF'?'<p class="note">Clarity is stored as IF although inclusions are recorded, so colour and clarity look like default values, not grades.</p>':''}
  ${s.repaired?'<p class="note">The detailed stone outline in this file is damaged, so the 3D view uses the simpler outline stored with it.</p>':''}
  ${s.dropped?`<p class="note">${s.dropped} inclusions could not be drawn because their mesh data is damaged.</p>`:''}`;
}
let galleryFor=null;
const galleryWatch=new IntersectionObserver(items=>{
  for(const it of items){
    if(!it.isIntersecting)continue;
    galleryWatch.unobserve(it.target);
    const b=it.target,g=b.firstElementChild,s=stones[current];
    checkFrame(s,g.im).then(bad=>{if(stones[current]!==s)return;if(bad)b.remove();else g.src=imageUrl(s,g.im)});
  }
},{root:$('main'),rootMargin:'300px'});
function renderGallery(s){
  if(galleryFor===s)return;
  galleryFor=s;galleryWatch.disconnect();
  $('gallery').replaceChildren(...s.frames.map((im,i)=>{
    const b=document.createElement('button'),g=new Image;
    g.im=im;g.alt=`Scan image ${i+1}`;g.onerror=()=>b.remove();
    b.append(g);b.onclick=()=>{$('big').firstElementChild.src=imageUrl(s,im);$('big').classList.add('on')};
    galleryWatch.observe(b);
    return b;
  }));
}
function renderCompare(){
  const ok=stones.map((s,i)=>[s,i]).filter(([s])=>!s.error);
  const sum=k=>ok.reduce((a,[s])=>a+(s[k]||0),0);
  $('tab-compare').innerHTML=`<table><thead><tr><th>Stone</th><th class="n">Rough (ct)</th><th class="n">Polished (ct)</th><th class="n">Yield</th><th class="n">Stones</th><th class="n">Inclusions</th></tr></thead><tbody>
  ${ok.map(([s,i])=>`<tr class="link" data-i="${i}"><td>${esc(s.name)}</td><td class="n">${s.rough.toFixed(3)}</td><td class="n">${s.polished.toFixed(3)}</td><td class="n">${pct(s.polished,s.rough)}</td><td class="n">${s.parts.length||'—'}</td><td class="n">${num(s.incTotal)}</td></tr>`).join('')}
  <tr><th>Total</th><th class="n">${sum('rough').toFixed(3)}</th><th class="n">${sum('polished').toFixed(3)}</th><th class="n">${pct(sum('polished'),sum('rough'))}</th><th class="n">${ok.reduce((a,[s])=>a+s.parts.length,0)}</th><th class="n">${num(sum('incTotal'))}</th></tr>
  </tbody></table>`;
  $('tab-compare').querySelectorAll('tr.link').forEach(r=>r.onclick=()=>{tab='model';select(+r.dataset.i)});
}
function setTab(t){
  tab=t;
  document.querySelectorAll('[role=tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  for(const n of['model','limits','plan','images','compare'])$('tab-'+n).hidden=n!==t;
  if(t==='model')render();
  if(t==='images'&&current>=0)renderGallery(stones[current]);
}
document.querySelectorAll('[role=tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$('big').onclick=()=>$('big').classList.remove('on');
$('rot360').onclick=()=>setRotation('free');
$('rotH').onclick=()=>setRotation('horizontal');
$('inset').onclick=()=>setScan(!scanMode);
$('rot360').setAttribute('aria-pressed',true);$('rotH').setAttribute('aria-pressed',false);
addEventListener('keydown',e=>{
  if(current<0||tab!=='model'||e.target.classList?.contains('num'))return;
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();toggleInclusions()}
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='d'||e.key==='D')toggleDiamond();
  if(e.key>='1'&&e.key<='5')fitStones(+e.key);
  if(e.key==='0')clearFit();
  if(e.key==='Escape')showOnly(null);
});
$('hideDiamond').onclick=toggleDiamond;
$('polishView').onclick=togglePolish;
$('sawView').onclick=lookAlongSaw;
$('insideView').onclick=()=>{
  const s=stones[current];
  insideColors=!insideColors;
  if(insideColors)$('showInc').checked=true;
  if(s){uploadInclusions(s);render();queueInset()}
};
$('polishStones').onclick=e=>{
  const pick=e.target.dataset?.polish;
  if(pick===undefined)return;
  if(pick==='proj'){
    projView=!projView;
    const s=stones[current];
    if(projView&&s){if(onlyStone===null)showOnly(0);$('showInc').checked=true;aimProjection(s);uploadInclusions(s)}
    if(s)renderPolishBar(s);
    render();queueInset();return;
  }
  const inc=$('showInc').checked;
  showOnly(pick==='all'?null:+pick);
  $('showInc').checked=inc;
  if(projView){const s=stones[current];if(s&&onlyStone!==null)aimProjection(s);else projView=false}
  const s=stones[current];if(s)renderPolishBar(s);
  render();queueInset();
};
$('autoPlan').onclick=autoPlan;
$('autoPick').onclick=()=>{
  const s=stones[current];if(!s)return;
  const c=autoPicks(s);
  picksChanged(s);
  $('fitInfo').textContent=`Auto select: ${c.use+c.skin} Use (${c.skin} near the surface), ${c.auto} Auto, ${c.size} ignored by size, ${c.pins} pin marks ignored.`;
};
$('showAll').onclick=()=>showOnly(null);
$('details').addEventListener('click',e=>{
  const row=e.target.closest('[data-auto]'),s=stones[current];
  if(row&&s?.autoResults){showAutoPlan(s,s.autoResults.find(r=>r.count===+row.dataset.auto));return}
  const t=e.target.closest('[data-only]');
  if(!t)return;
  const i=+t.dataset.only;
  showOnly(i===onlyStone?null:i);
});
$('details').addEventListener('input',e=>{
  const t=e.target,v=parseFloat(t.value),s=stones[current];
  if(!t.dataset.key||!Number.isFinite(v)||v<=0||!s)return;
  editStone(s,+t.dataset.part,t.dataset.key,v);
  t.classList.toggle('out',t.dataset.key!=='dia'&&outOfLimit(t.dataset.key,v));
  $('details').querySelector(`[data-derived="${t.dataset.part}"]`).innerHTML=partDerived(activeStones(s)[+t.dataset.part]);
});
$('tab-limits').addEventListener('input',e=>{
  const t=e.target,v=parseFloat(t.value);
  if(!t.dataset.limit||!Number.isFinite(v))return;
  limits[t.dataset.limit][+t.dataset.end]=v;saveLimits();refreshActual();
});
renderLimits();
document.querySelectorAll('[data-fit]').forEach(b=>b.onclick=()=>{b.blur();fitStones(+b.dataset.fit)});
$('fitClear').onclick=clearFit;
$('savePlan').onclick=savePlan;
$('editSaw').onclick=()=>setTool('saw');
$('splitInc').onclick=()=>setTool('split');
$('stage').addEventListener('contextmenu',e=>{if(editSaw)e.preventDefault()});
$('saveAdv').onclick=saveNewAdv;
$('exportFolder').onclick=()=>chooseFolder('export');
$('stoneFolder').onclick=()=>chooseFolder('stone');
$('bulkPlanTop').onclick=bulkPlan;
$('advisorRunTop').onclick=advisorRun;
$('advPrepare').onclick=prepareForAdvisor;
$('advPick').onclick=pickBestSaves;
$('advCancel').onclick=()=>$('advisorDialog').close();
document.querySelectorAll('[data-adv-folder]').forEach(b=>b.onclick=()=>chooseAdvFolder(b.dataset.advFolder));
$('fillSavesTop').onclick=fillSaves;
$('bulkChooseStone').onclick=()=>pickBulkFolder('stone');
$('bulkChooseExport').onclick=()=>pickBulkFolder('export');
$('bulkChooseOutput').onclick=()=>pickBulkFolder('output');
$('bulkStart').onclick=startBulk;
$('bulkCancel').onclick=()=>$('bulkDialog').close();
$('bulkNext').onclick=bulkNext;
$('bulkBack').onclick=()=>bulkStep(1);
$('bulkDialog').addEventListener('close',()=>{limitsAway.home.insertBefore($('tab-limits'),limitsAway.next);$('tab-limits').hidden=limitsAway.hidden});
restoreFolders();
$('exportCsv').onclick=async()=>{const s=stones[current];if(s)$('fitInfo').textContent=await exportCsv(s)};
$('openPlan').onchange=async e=>{if(e.target.files[0])await openPlan(e.target.files[0]);e.target.value=''};
// Keys only reach the page while it has focus, so a click on the stone gives it focus.
$('stage').addEventListener('pointerdown',()=>window.focus());
$('pickMode').onclick=()=>setPickMode(!pickMode);
$('pickAll').onclick=()=>setAllPicks(false);
$('pickNone').onclick=()=>setAllPicks(true);
$('scan').addEventListener('pointerdown',e=>{if(toolDown(e,$('scan')))return;frameDrag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,frame:frameAt,moved:0,steps:0};$('scan').setPointerCapture(e.pointerId)});
$('scan').addEventListener('pointermove',e=>{
  if(toolMove(e))return;
  if(frameDrag===null)return;
  const d=frameDrag,dx=e.clientX-d.x,dy=e.clientY-d.y;
  d.x=e.clientX;d.y=e.clientY;
  if(e.shiftKey){
    // Shift moves the picture; a plain drag only turns the stone.
    const r=Math.min(devicePixelRatio||1,2),fit=scanFit(gl.canvas.width,gl.canvas.height)/r;
    scanView.x=Math.min(1024,Math.max(0,scanView.x-dx/fit));
    scanView.y=Math.min(1280,Math.max(0,scanView.y+dy/fit));
    render();
    return;
  }
  d.moved+=dx;
  const steps=Math.round(d.moved/3);
  if(steps===d.steps)return;
  const dir=steps>d.steps?1:-1;
  d.steps=steps;
  goToFrame(d.frame+steps,dir);
});
$('scan').addEventListener('pointerup',e=>{if(toolUp())return;const d=frameDrag;frameDrag=null;if(d)clickedStage($('scan'),e,d.startX,d.startY)});
$('scan').addEventListener('wheel',e=>{
  e.preventDefault();
  const r=Math.min(devicePixelRatio||1,2),box=$('scan').getBoundingClientRect();
  setScanZoom(scanView.zoom*Math.exp(-e.deltaY*.0025),(e.clientX-box.left)*r,(e.clientY-box.top)*r);
},{passive:false});
// Two quick clicks are a pick and an unpick while a tool is on, not a zoom reset.
$('scan').addEventListener('dblclick',()=>{if(pickMode||editSaw||splitMode)return;resetScanView();render()});
$('zoomIn').onclick=()=>zoomButton(1.5);
$('zoomOut').onclick=()=>zoomButton(1/1.5);
$('zoomReset').onclick=()=>{resetScanView();cam.zoom=1;cam.panX=cam.panY=0;render()};

async function loadFiles(files){
  for(const file of files){
    if(/\.json$/i.test(file.name)){await openPlan(file);continue}
    const at=stones.findIndex(s=>s.file.name===file.name&&s.file.size===file.size);
    if(at>=0)continue;
    let s;
    try{s=await openAdv(file)}
    catch(e){s={file,name:file.name,error:e.message}}
    stones.push(s);
    stones.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    renderList();
    if(!s.error&&current<0)select(stones.indexOf(s));
    else if(current>=0)current=stones.findIndex(x=>x.file===stones[current]?.file);
  }
  const first=stones.findIndex(s=>!s.error);
  if(first>=0)select(current>=0&&!stones[current].error?current:first);
}
$('pick').onchange=e=>{loadFiles([...e.target.files]);e.target.value=''};
let dragDepth=0;
addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('drop').classList.add('on')});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').classList.remove('on')}});
addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop').classList.remove('on');loadFiles([...e.dataTransfer.files])});
if(!gl)$('dim').textContent='WebGL is not available in this browser';
