import { processImage } from './engine.js';
self.onmessage=async ({data})=>{
  let last=0;
  try {
    const result=await processImage(data.bytes,data.mode,(fraction,pass=0)=>{
      if(performance.now()-last>100 || fraction===1){ self.postMessage({fraction,pass}); last=performance.now(); }
    });
    self.postMessage({result});
  } catch(e){ self.postMessage({error:e.message || 'unsupported'}); }
};
