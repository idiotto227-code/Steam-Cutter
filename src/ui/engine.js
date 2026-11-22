import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';

export const layouts = { workshop: [150, 150, 150, 150, 150], artwork: [506, 100] };
const limit = 5_000_000;
function fail(key) { throw new Error(key); }

export function identify(bytes) {
  const u = new Uint8Array(bytes), d = new DataView(bytes);
  const str = (p, n) => String.fromCharCode(...u.subarray(p, p+n));
  if (u.length < 12) fail('unsupported');
  if (str(0,3) === 'GIF') return ['image/gif', d.getUint16(6,true), d.getUint16(8,true)];
  if (u[0] === 137 && str(1,3) === 'PNG' && u.length >= 24)
    return ['image/png', d.getUint32(16), d.getUint32(20)];
  if (str(0,4) === 'RIFF' && str(8,4) === 'WEBP' && u.length >= 30) {
    switch (str(12,4)) {
      case 'VP8X': return ['image/webp',1+u[24]+(u[25]<<8)+(u[26]<<16),1+u[27]+(u[28]<<8)+(u[29]<<16)];
      case 'VP8L': return ['image/webp',1+u[21]+((u[22]&63)<<8),1+(u[22]>>6)+(u[23]<<2)+((u[24]&15)<<10)];
      case 'VP8 ': return ['image/webp',d.getUint16(26,true)&16383,d.getUint16(28,true)&16383];
    }
  }
  if (u[0] === 255 && u[1] === 216) {
    let p=2;
    while (p+8<u.length && u[p]===255) {
      while (u[p]===255) p++;
      const marker=u[p++];
      if (marker===0xda || marker===0xd9) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))
        return ['image/jpeg',d.getUint16(p+5),d.getUint16(p+3)];
      const length=d.getUint16(p); if (length<2) break; p+=length;
    }
  }
  fail('unsupported');
}

function indexed(rgba, colors) {
  // Exact colours first, including a separate transparent index for GIF disposal.
  const palette=[[0,0,0]], indices=new Uint8Array(rgba.length/4), found=new Map();
  for (let p=0; p<indices.length; p++) {
    const i=4*p;
    if (rgba[i+3]<128) continue;
    const key=(rgba[i]<<16)|(rgba[i+1]<<8)|rgba[i+2];
    let index=found.get(key);
    if (index===undefined) {
      if (palette.length===colors) {
        const reduced=quantize(rgba,colors-1,{format:'rgb565'});
        const mapped=applyPalette(rgba,reduced,'rgb565');
        for (let j=0;j<mapped.length;j++) mapped[j]=rgba[4*j+3]<128 ? 0 : mapped[j]+1;
        return { indices:mapped, palette:[[0,0,0],...reduced] };
      }
      index=palette.length; palette.push([rgba[i],rgba[i+1],rgba[i+2]]); found.set(key,index);
    }
    indices[p]=index;
  }
  if (palette.length===1) palette.push([0,0,0]);
  return { indices, palette };
}

export async function processImage(bytes, mode, progress=()=>{}) {
  const widths=layouts[mode]; if (!widths) fail('layout');
  if (bytes.byteLength>32*1024*1024) fail('tooBig');
  const [mime,w,h]=identify(bytes);
  if (!w || !h || w*h>48_000_000) fail('dimensions');
  if (!self.ImageDecoder) fail('runtime');
  const decoder=new ImageDecoder({data:bytes,type:mime,preferAnimation:true});
  let first;
  try {
    await decoder.completed; await decoder.tracks.ready;
    const track=decoder.tracks.selectedTrack, frames=track.frameCount;
    if (!frames || frames>1600 || frames*w*h>2_000_000_000) fail('complex');
    first=(await decoder.decode({frameIndex:0})).image;
    const width=widths.reduce((a,b)=>a+b,0);
    // Canvas honours display orientation (including phone JPEG EXIF).
    const bitmap = await createImageBitmap(new Blob([bytes],{type:mime}));
    const sourceWidth=bitmap.width, sourceHeight=bitmap.height, height=Math.max(1,Math.round(sourceHeight*width/sourceWidth));
    if (height>4096) { bitmap.close(); fail('dimensions'); }
    const canvas=new OffscreenCanvas(width,height), ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    const slices=widths.map(w=>new OffscreenCanvas(w,height));
    const contexts=slices.map(s=>s.getContext('2d',{willReadFrequently:true}));
    function draw(frame) {
      ctx.clearRect(0,0,width,height); ctx.drawImage(frame,0,0,width,height);
      let x=0;
      slices.forEach((s,j)=>{
        const c=contexts[j]; c.clearRect(0,0,s.width,height);
        c.drawImage(canvas,x,0,s.width,height,0,0,s.width,height); x+=s.width;
      });
    }
    if (frames===1) {
      draw(bitmap); bitmap.close();
      const parts=await Promise.all(slices.map(s=>s.convertToBlob({type:'image/png'})));
      for (let i=0;i<parts.length;i++) {
        if (parts[i].size<=limit) continue;
        const enc=GIFEncoder(), pixels=contexts[i].getImageData(0,0,widths[i],height).data;
        const {indices,palette}=indexed(pixels,256);
        enc.writeFrame(indices,widths[i],height,{palette,transparent:true,repeat:-1}); enc.finish();
        parts[i]=new Blob([enc.bytesView()],{type:'image/gif'});
      }
      if (parts.some(p=>p.size>limit)) fail('overBudget');
      progress(1); return {parts,width,height,frames,exportedFrames:1,sourceWidth,sourceHeight};
    }
    bitmap.close();
    const repeat=Number.isFinite(track.repetitionCount) ? (track.repetitionCount===0 ? -1 : Math.min(65535,track.repetitionCount)) : 0;
    const passes=[[1,256],[1,96],[2,96],[4,64],[8,32]];
    for (let pass=0; pass<passes.length;pass++) {
      const [stride,colors]=passes[pass], encoders=slices.map(()=>GIFEncoder());
      let oversized=false, count=0, pending=[], delay=0;
      const flush=()=>{
        for(let j=0;j<slices.length;j++) {
          let left=delay;
          do {
            const step=Math.min(655350,left);
            encoders[j].writeFrame(pending[j].indices,widths[j],height,
              {palette:pending[j].palette,transparent:true,transparentIndex:0,dispose:2,delay:step,repeat});
            left-=step;
          } while(left>0);
          if(encoders[j].bytesView().length+1>limit) oversized=true;
        }
        count++; delay=0;
      };
      for(let i=0;i<frames;i++) {
        let image=i===0 ? first : (await decoder.decode({frameIndex:i})).image;
        try {
          if (i%stride===0) {
            draw(image);
            pending=contexts.map((c,j)=>indexed(c.getImageData(0,0,widths[j],height).data,colors));
          }
          delay+=Math.max(10,Math.round((image.duration || 100000)/10000)*10);
        } finally { if(i!==0) image.close(); }
        if((i+1)%stride===0 || i===frames-1) flush();
        progress((i+1)/frames,pass);
        if(oversized) break;
      }
      if(oversized) continue;
      encoders.forEach(e=>e.finish());
      return {parts:encoders.map(e=>new Blob([e.bytesView()],{type:'image/gif'})),width,height,frames,exportedFrames:count,sourceWidth,sourceHeight};
    }
    fail('overBudget');
  } finally { first?.close(); decoder.close(); }
}
