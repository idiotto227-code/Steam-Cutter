import {languages,translate} from './lang.js';
const $=id=>document.getElementById(id);
const short=navigator.language.toLowerCase().split('-')[0];
let lang=localStorage.getItem('language') || (languages.includes(short)?short:'en');
let mode=localStorage.getItem('layout')==='artwork'?'artwork':'workshop';
const t=key=>translate(key,lang), calls=new Map(), jobs=[], bridge=window.chrome?.webview;
let sequence=0, current=null, lastFile=null, preview=null, urls=[], running=false;
function rpc(op,data={}) {
  return new Promise((resolve,reject)=>{
    if(!bridge) return reject(new Error('Steam Cutter desktop host required.'));
    const id=String(++sequence); calls.set(id,{resolve,reject});
    try {bridge.postMessage({id,op,...data});}catch(e){calls.delete(id);reject(e);}
  });
}
bridge?.addEventListener('message',({data})=>{const c=calls.get(data.id);if(!c)return;calls.delete(data.id);data.error?c.reject(new Error(data.error)):c.resolve(data.value);});
function note(e){$('notice').textContent=e?t(e.message||e):'';}
function button(text,fn,kind='subtle'){
  const b=document.createElement('button'); b.className=kind;b.textContent=text;
  b.onclick=()=>Promise.resolve().then(fn).catch(note);return b;
}
function renderJob(j){
  const row=j.row;row.className='job'+(j.state==='failed'?' error':'');
  const info=document.createElement('div');info.className='job-text';
  const name=document.createElement('div');name.className='job-name';name.title=name.textContent=j.name;
  const desc=document.createElement('div');desc.className='job-meta';
  let text=t(j.state);
  if(j.state==='failed') text+=' · '+t(j.error);
  if(j.state==='cutting'||j.state==='optimizing')text+=' · '+Math.round(j.fraction*100)+'%';
  if(j.state==='saved')text+=' · '+j.size+' · '+j.count+' '+t('files')+(j.frames>1?' · '+j.outputFrames+'/'+j.frames+' '+t('frames'):'');
  desc.textContent=t(j.mode)+' · '+text;info.append(name,desc);row.replaceChildren(info);
  if(j.worker || j.state==='queued') row.append(button(t('cancel'),()=>cancel(j)));
  if(j.state==='saved'){
    row.append(button(t('folder'),()=>rpc('folder',{job:j.exportId})),button(t('publish'),()=>rpc('steam',{job:j.exportId,lang}),'subtle publish'));
  }
}
function showSample(){
  preview=null; urls.forEach(URL.revokeObjectURL);urls=[];
  const pic=$('picture');pic.className=mode+' sample';pic.removeAttribute('style');pic.replaceChildren(...Array.from({length:4},()=>document.createElement('i')));
  $('previewName').textContent='Spectrum';$('previewLabel').textContent=t('example');$('geometry').textContent=mode==='workshop'?'5 × 150 px':'506 + 100 px';
}
function showResult(j,res){
  urls.forEach(URL.revokeObjectURL);urls=res.parts.map(p=>URL.createObjectURL(p));preview=j;
  const pic=$('picture');pic.className='output-parts '+j.mode;
  // Explicit canvas-sized box preserves proportions for unusually tall or wide results.
  const display=()=>{const box=$('stage'); if(preview!==j)return;
    const gutter=(res.parts.length-1)*4, scale=Math.min((box.clientWidth-44-gutter)/res.width,360/res.height);
    pic.style.width=(res.width*scale+gutter)+'px';pic.style.height=Math.max(1,res.height*scale)+'px';};
  pic.replaceChildren(...urls.map((url,i)=>{const el=new Image();el.src=url;el.alt=String(i+1);return el;}));
  display(); onresize=display;
  $('previewName').textContent=j.name;$('previewLabel').textContent=t('result');$('geometry').textContent=res.width+' × '+res.height+' px';
}
function language(){
  document.documentElement.lang=lang; $('lang').value=lang;
  document.querySelectorAll('[data-t]').forEach(el=>el.textContent=t(el.dataset.t));jobs.forEach(renderJob);
  $('previewLabel').textContent=t(preview?'result':'example');
}
$('lang').onchange=e=>{lang=e.target.value;localStorage.setItem('language',lang);language();};
function selectLayout(value,reprocess){
  if(value===mode && reprocess)return;
  mode=value;localStorage.setItem('layout',mode);document.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
  showSample();if(reprocess && lastFile && !running)enqueue([{file:lastFile,name:lastFile.name}],false);
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>selectLayout(b.dataset.mode,true));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(p=>{const active=p===b;p.setAttribute('aria-pressed',String(active));$(p.dataset.tab).hidden=!active;});if(b.dataset.tab==='url')$('urlInput').focus();});
$('autoSteam').checked=localStorage.getItem('autoSteam')!=='off';
$('autoSteam').onchange=e=>localStorage.setItem('autoSteam',e.target.checked?'on':'off');
function enqueue(inputs,auto=true){
  if(!inputs.length)return;
  note('');$('activity').hidden=false;
  const batch={open:auto && $('autoSteam').checked,first:null,remaining:inputs.length};
  for(const input of inputs){const row=document.createElement('div');const j={...input,mode,state:'queued',row,batch};
    jobs.push(j);$('jobs').prepend(row);renderJob(j);}
  $('count').textContent=String(jobs.length);if(!running)void drain();
}
function addFiles(files){enqueue(Array.from(files,file=>({file,name:file.name})));}
$('choose').onclick=()=>$('picker').click();$('picker').onchange=e=>{addFiles(e.target.files);e.target.value='';};
let depth=0;
for(const ev of ['dragenter','dragover','dragleave','drop'])window.addEventListener(ev,e=>{
  if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();
  if(ev==='dragenter')depth++;if(ev==='dragleave')depth=Math.max(0,depth-1);
  if(ev==='drop'){depth=0;addFiles(e.dataTransfer.files);}
  document.body.classList.toggle('dragging',depth>0);
});
$('getUrl').onclick=()=>{let link=$('urlInput').value.trim();try{const parsed=new URL(link);if(!['https:','http:'].includes(parsed.protocol))throw 0;}catch{return note('urlInvalid');}
  enqueue([{link,name:link}]);};
$('urlInput').onkeydown=e=>{if(e.key==='Enter')$('getUrl').click();};
$('openInbox').onclick=()=>rpc('openInbox').catch(note);
$('runInbox').onclick=async()=>{try {const items=await rpc('inbox');if(!items.length)return note('empty');enqueue(items.map(ticket=>({name:ticket.name,ticket})));}catch(e){note(e);}};
$('changeOutput').onclick=async()=>{try{$('outputPath').textContent=await rpc('chooseOutput');}catch(e){note(e);}};
function candidates(html,base){
  const template=document.createElement('template');template.innerHTML=html;const dom=template.content;
  const absolute=(value,origin)=>{try{const url=new URL(value,origin);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
  const baseHref=dom.querySelector('base[href]')?.getAttribute('href');if(baseHref)base=absolute(baseHref,base)||base;
  const items=[];for(const key of ['og:image:secure_url','og:image','twitter:image','twitter:image:src']){
    for(const m of dom.querySelectorAll('meta'))if([m.getAttribute('property'),m.getAttribute('name')].includes(key))items.push(m.content);
  }
  for(const img of dom.querySelectorAll('img'))items.push(img.getAttribute('data-src'),img.getAttribute('src'));
  return [...new Set(items.filter(Boolean).map(url=>absolute(url,base)).filter(Boolean))].slice(0,8);
}
async function readTicket(ticket){
  try{if(ticket.size>32*1024*1024)throw new Error('tooBig');
    const resp=await fetch('/media/'+ticket.token);if(!resp.ok)throw new Error('unsupported');
    return new File([await resp.blob()],ticket.name);
  }finally{await rpc('releaseMedia',{token:ticket.token});}
}
async function fromLink(link){
  const item=await rpc('url',{url:link});if(item.kind==='image')return readTicket(item);
  for(const url of candidates(item.html,item.url)){
    try{const m=await rpc('url',{url});if(m.kind==='image'){
      const file=await readTicket(m);const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
      if(b[0]===137||b[0]===255||b[0]===71||b[0]===82)return file;
    }}catch{/* Some websites use unavailable preview URLs. Try the next image. */}
  }throw new Error('noImage');
}
function convert(bytes,j){
  return new Promise((resolve,reject)=>{
    const worker=new Worker('worker.js',{type:'module'});j.worker=worker;j.stop=()=>reject(new Error('cancelled'));renderJob(j);
    worker.onmessage=({data})=>{
      if(data.result)resolve(data.result);else if(data.error)reject(new Error(data.error));
      else{j.state=data.pass?'optimizing':'cutting';j.fraction=data.fraction;renderJob(j);}
    };worker.onerror=ev=>reject(new Error(ev.message||'unsupported'));worker.postMessage({bytes,mode:j.mode},[bytes]);
  }).finally(()=>{j.worker?.terminate();j.worker=null;j.stop=null;});
}
async function completeBatch(j){
  const batch=j.batch;if(j.exportId && !batch.first)batch.first=j.exportId;
  if(--batch.remaining===0 && batch.open && batch.first)await rpc('steam',{job:batch.first,lang}).catch(note);
}
function cancel(j){if(j.state==='queued'){j.state='cancelled';j.file=null;void completeBatch(j);if(j.ticket)rpc('releaseMedia',{token:j.ticket.token}).catch(note);renderJob(j);}else j.stop?.();}
function base64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
async function run(j){
  j.state=j.link?'fetching':'reading';renderJob(j);
  const file=j.file || (j.link?await fromLink(j.link):await readTicket(j.ticket));
  j.file=null;j.ticket=null;
  if(file.size>32*1024*1024)throw new Error('tooBig');
  j.name=file.name;j.state='cutting';j.fraction=0;renderJob(j);
  const result=await convert(await file.arrayBuffer(),j);lastFile=file;
  j.state='saving';renderJob(j);
  const token=await rpc('begin',{name:j.name,mode:j.mode});
  try {
    for(const [index,part] of result.parts.entries())
      await rpc('write',{job:token,index,ext:part.type==='image/png'?'png':'gif',bytes:await base64(part)});
    await rpc('finish',{job:token});
  }catch(e){await rpc('abort',{job:token}).catch(()=>{});throw e;}
  j.exportId=token;j.state='saved';j.count=result.parts.length;j.frames=result.frames;j.outputFrames=result.exportedFrames;
  const kb=result.parts.reduce((sum,p)=>sum+p.size,0)/1024;j.size=kb>=1024?(kb/1024).toFixed(1)+' MiB':Math.ceil(kb)+' KiB';
  showResult(j,result);
}
async function drain(){
  running=true;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=true);
  try{while((current=jobs.find(j=>j.state==='queued'))){const j=current;
    try{await run(j);}catch(e){j.error=e.message;j.state=j.error==='cancelled'?'cancelled':'failed';}finally{j.file=null;renderJob(j);await completeBatch(j);}
  }}finally{running=false;current=null;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);}
}
language();selectLayout(mode,false);
rpc('info').then(v=>{$('outputPath').textContent=v.output;$('openInbox').title=v.inbox;}).catch(note);
