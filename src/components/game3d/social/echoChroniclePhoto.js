// Echo Chronicle: optional player-selected screenshot attached to one
// genuinely saved memory. Client-local, character-scoped; never uploaded.
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const MAX_FILE=8*1024*1024;
const MAX_URI=180000; // ~135 KB local-storage budget per attached moment
export async function readChroniclePhoto(file){
 if(!file||!TYPES.has(file.type)||!Number.isFinite(file.size)||
   file.size<=0||file.size>MAX_FILE)
  throw Error('Choose a JPG, PNG or WebP image smaller than 8 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((resolve,reject)=>{
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('This photograph could not be opened.'));
   img.src=url;
  });
  if(!image.naturalWidth||!image.naturalHeight)
   throw Error('This photograph does not have valid dimensions.');
  const scale=Math.min(1,960/image.naturalWidth,620/image.naturalHeight);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Your browser cannot prepare this photograph.');
  ctx.fillStyle='#0f102c';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.78,.65,.5,.35]){
   const result=canvas.toDataURL('image/jpeg',quality);
   if(result.length<=MAX_URI)return result;
  }
  throw Error('This image is too detailed for local Chronicle storage.');
 }finally{URL.revokeObjectURL(url)}
}
export const isChroniclePhoto=(value)=>typeof value==='string'&&
 value.length<=MAX_URI&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
