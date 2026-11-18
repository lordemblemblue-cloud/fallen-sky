#!/usr/bin/env node
// Wolfveil terrain macro bake (2026-11-16 landscaping, round 2).
//
// High-poly -> texture -> low-poly for the whole map. The shared height
// function (client mesh, BVH and server collision all use it) is evaluated
// at 2048 x 2048 (0.54 m; the game mesh is 310 x 310 = 3.55 m). The mountain
// ranges then get a droplet hydraulic-erosion pass (gullies, ridges, scree
// fans). Baked from that high-resolution surface for the game mesh:
//   wv_terrain_macro_normal.webp  2048^2  R,G world normal x,z  B fine cavity
//   wv_terrain_macro_mask.webp    1024^2  R sky AO  G water flow  B deposits
//   wv_terrain_macro.json         layout, erosion stats, height checksum
// Erosion is shading only: the mesh and collision keep the analytic height.
//
//   node scripts/bake-wolfveil-terrain-macro.mjs [--out public/game3d/landscape]
//        [--preview docs/game3d/landscaping/bake-20261116] [--droplets 450000]
// Deterministic (seeded); heights are cached by checksum between runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {wolfveilHeight,wolfveilLandscapeLiftAt,wolfveilDistanceToRiver,wolfveilAnyTrailClearance}
  from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {WOLFVEIL_TERRAIN_MACRO as M,wolfveilTerrainMacroChecksum}
  from '../src/components/game3d/wolfveil/WolfveilTerrainMacro.mjs';

const SPAN=M.span,HALF=SPAN/2,N=M.normalSize,E=M.maskSize,K=256;
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

function evalRows({kind,j0,j1,size}){
  const cell=SPAN/size;
  if(kind==='height'){
    const out=new Float32Array((j1-j0)*size);
    for(let j=j0;j<j1;j++){
      const z=-HALF+(j+.5)*cell;
      for(let i=0;i<size;i++)out[(j-j0)*size+i]=wolfveilHeight(-HALF+(i+.5)*cell,z);
    }
    return out;
  }
  // 'mask': erodibility (mountain lift after protection) + deposit allowance
  // (no scree on trails, the river or its banks).
  const out=new Float32Array((j1-j0)*size*2);
  for(let j=j0;j<j1;j++){
    const z=-HALF+(j+.5)*cell;
    for(let i=0;i<size;i++){
      const x=-HALF+(i+.5)*cell,k=((j-j0)*size+i)*2;
      out[k]=smooth(3,26,wolfveilLandscapeLiftAt(x,z));
      out[k+1]=smooth(3,12,wolfveilAnyTrailClearance(x,z))*smooth(8,24,wolfveilDistanceToRiver(x,z));
    }
  }
  return out;
}

if(!isMainThread){
  parentPort.postMessage(evalRows(workerData));
}else{
  await main();
}

async function parallel(kind,size,stride){
  const threads=Math.max(1,Math.min(12,(os.availableParallelism?.()||os.cpus().length)-1));
  const rows=Math.ceil(size/threads),jobs=[];
  for(let t=0;t<threads;t++){
    const j0=t*rows,j1=Math.min(size,j0+rows);
    if(j0>=j1)break;
    jobs.push(new Promise((resolve,reject)=>{
      const w=new Worker(new URL(import.meta.url),{workerData:{kind,j0,j1,size}});
      w.once('message',data=>{resolve({j0,data});w.terminate();});
      w.once('error',reject);
    }));
  }
  const out=new Float32Array(size*size*stride);
  for(const {j0,data} of await Promise.all(jobs))out.set(data,j0*size*stride);
  return out;
}

function mulberry32(a){
  return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}

// Bilinear resample of an interleaved grid (cell-centred) to another size.
function resample(src,from,to,stride,ch){
  const out=new Float32Array(to*to);
  for(let j=0;j<to;j++){
    const v=Math.min(from-1.0001,Math.max(0,(j+.5)*from/to-.5)),vj=v|0,fv=v-vj;
    for(let i=0;i<to;i++){
      const u=Math.min(from-1.0001,Math.max(0,(i+.5)*from/to-.5)),ui=u|0,fu=u-ui;
      const a=src[(vj*from+ui)*stride+ch],b=src[(vj*from+ui+1)*stride+ch];
      const c=src[((vj+1)*from+ui)*stride+ch],d=src[((vj+1)*from+ui+1)*stride+ch];
      out[j*to+i]=(a*(1-fu)+b*fu)*(1-fv)+(c*(1-fu)+d*fu)*fv;
    }
  }
  return out;
}

// Exact 2x Catmull-Rom upsample (cell-centred grids): no bilinear creases in
// the curvature of the eroded detail.
function upsample2x(src,size){
  const w=t=>[((-.5*t+1)*t-.5)*t,(1.5*t-2.5)*t*t+1,((-1.5*t+2)*t+.5)*t,(.5*t-.5)*t*t];
  const we=w(.75),wo=w(.25),S=size*2;
  const at=(a,i)=>Math.min(size-1,Math.max(0,i));
  const row=new Float32Array(S*size);
  for(let j=0;j<size;j++)for(let i=0;i<S;i++){
    const even=(i&1)===0,base=even?i/2-1:(i-1)/2,wt=even?we:wo;
    let s=0;for(let k=0;k<4;k++)s+=wt[k]*src[j*size+at(0,base-1+k)];
    row[j*S+i]=s;
  }
  const out=new Float32Array(S*S);
  for(let j=0;j<S;j++){
    const even=(j&1)===0,base=even?j/2-1:(j-1)/2,wt=even?we:wo;
    for(let i=0;i<S;i++){
      let s=0;for(let k=0;k<4;k++)s+=wt[k]*row[at(0,base-1+k)*S+i];
      out[j*S+i]=s;
    }
  }
  return out;
}

/**
 * Droplet hydraulic erosion (Beyer 2015) on heights normalised by `scale`
 * so the classic parameters apply. Erosion is weighted by `mountain`,
 * deposition by `allow`; returns per-cell water traffic.
 */
function erode(h,mountain,allow,size,{droplets,seed=20261116,scale=100,maxSteps=56,inertia=.05,
  capacity=4,minCapacity=.01,erodeRate=.14,depositRate=.3,evaporate=.014,gravity=4,radius=3}){
  for(let k=0;k<h.length;k++)h[k]/=scale;
  const rng=mulberry32(seed),offs=[],wts=[];
  let sum=0;
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    const w=1-Math.hypot(dx,dz)/radius;
    if(w<=0)continue;offs.push(dz*size+dx);wts.push(w);sum+=w;
  }
  const bo=Int32Array.from(offs),bw=Float32Array.from(wts,w=>w/sum),bn=bo.length;
  const flow=new Float32Array(size*size),lo=radius+1,hi=size-radius-2;
  let spawned=0,tries=0,steps=0;
  while(spawned<droplets&&tries<droplets*60){
    tries++;
    let x=lo+rng()*(hi-lo),z=lo+rng()*(hi-lo);
    const m=mountain[(z|0)*size+(x|0)];
    if(m<.02||rng()>m)continue;
    spawned++;
    let dx=0,dz=0,speed=1,water=1,sed=0;
    for(let s=0;s<maxSteps;s++){
      const xi=x|0,zi=z|0,fx=x-xi,fz=z-zi,idx=zi*size+xi;
      const h00=h[idx],h10=h[idx+1],h01=h[idx+size],h11=h[idx+size+1];
      const gx=(h10-h00)*(1-fz)+(h11-h01)*fz,gz=(h01-h00)*(1-fx)+(h11-h10)*fx;
      const hh=h00+(h10-h00)*fx+(h01-h00)*fz+(h00-h10-h01+h11)*fx*fz;
      dx=dx*inertia-gx*(1-inertia);dz=dz*inertia-gz*(1-inertia);
      let len=Math.hypot(dx,dz);
      if(len<1e-9){const a=rng()*6.2831853;dx=Math.cos(a);dz=Math.sin(a);len=1;}
      dx/=len;dz/=len;
      const nx=x+dx,nz=z+dz;
      if(nx<lo||nz<lo||nx>=hi||nz>=hi)break;
      const ni=nx|0,nj=nz|0,gu=nx-ni,gv=nz-nj,nidx=nj*size+ni;
      const a00=h[nidx],a10=h[nidx+1],a01=h[nidx+size],a11=h[nidx+size+1];
      const dh=a00+(a10-a00)*gu+(a01-a00)*gv+(a00-a10-a01+a11)*gu*gv-hh;
      const cap=Math.max(-dh*speed*water*capacity,minCapacity);
      if(sed>cap||dh>0){
        const amt=dh>0?Math.min(dh,sed):(sed-cap)*depositRate;
        sed-=amt;
        // Sediment reaching a trail, the river or its banks is carried away.
        const put=amt*allow[idx];
        h[idx]+=put*(1-fx)*(1-fz);h[idx+1]+=put*fx*(1-fz);
        h[idx+size]+=put*(1-fx)*fz;h[idx+size+1]+=put*fx*fz;
      }else{
        const want=Math.min((cap-sed)*erodeRate,-dh);
        let got=0;
        for(let k=0;k<bn;k++){const c=idx+bo[k],d=want*bw[k]*mountain[c];h[c]-=d;got+=d;}
        sed+=got;
      }
      speed=Math.sqrt(Math.max(0,speed*speed-dh*gravity));
      water*=1-evaporate;
      flow[idx]+=water;
      x=nx;z=nz;steps++;
    }
  }
  for(let k=0;k<h.length;k++)h[k]*=scale;
  return {flow,spawned,steps};
}

function boxBlur(src,size,r){
  const at=v=>Math.min(size-1,Math.max(0,v)),tmp=new Float32Array(size*size),out=new Float32Array(size*size),n=2*r+1;
  for(let j=0;j<size;j++){let s=0;for(let k=-r;k<=r;k++)s+=src[j*size+at(k)];
    for(let i=0;i<size;i++){tmp[j*size+i]=s/n;s+=src[j*size+at(i+r+1)]-src[j*size+at(i-r)];}}
  for(let i=0;i<size;i++){let s=0;for(let k=-r;k<=r;k++)s+=tmp[at(k)*size+i];
    for(let j=0;j<size;j++){out[j*size+i]=s/n;s+=tmp[at(j+r+1)*size+i]-tmp[at(j-r)*size+i];}}
  return out;
}

function percentile(arr,p,filter=()=>true){
  const v=[];for(let k=0;k<arr.length;k+=7)if(filter(k))v.push(arr[k]);
  if(!v.length)return 0;v.sort((a,b)=>a-b);
  return v[Math.min(v.length-1,Math.floor(p*v.length))];
}

// Horizon-based sky occlusion: 12 azimuths, horizon search out to ~64 m.
function skyOcclusion(h,size,cell){
  const dist=[1,2,3,5,7,10,14,19,26,35,47,60],dirs=12,ao=new Float32Array(size*size);
  const steps=[];
  for(let a=0;a<dirs;a++){
    const ang=a/dirs*Math.PI*2,c=Math.cos(ang),s=Math.sin(ang);
    for(const d of dist)steps.push(Math.round(c*d),Math.round(s*d),d*cell);
  }
  const per=dist.length;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const h0=h[j*size+i];let occ=0;
    for(let a=0;a<dirs;a++){
      let best=0;
      for(let k=0;k<per;k++){
        const o=(a*per+k)*3,ii=i+steps[o],jj=j+steps[o+1];
        if(ii<0||jj<0||ii>=size||jj>=size)break;
        const e=h[jj*size+ii]-h0;
        if(e>0){const sn=e/Math.hypot(e,steps[o+2]);if(sn>best)best=sn;}
      }
      occ+=best;
    }
    ao[j*size+i]=1-occ/dirs;
  }
  return ao;
}

function normalsAndCavity(h,size,cell,out){
  const box=2,area=(2*box+1)**2;
  // Separable box mean for the cavity (h - local mean).
  const tmp=new Float32Array(size*size),mean=new Float32Array(size*size);
  const at=v=>Math.min(size-1,Math.max(0,v));
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){let s=0;for(let k=-box;k<=box;k++)s+=h[j*size+at(i+k)];tmp[j*size+i]=s;}
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){let s=0;for(let k=-box;k<=box;k++)s+=tmp[at(j+k)*size+i];mean[j*size+i]=s/area;}
  let cavMax=0;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const k=j*size+i;
    const hx=(h[j*size+at(i+1)]-h[j*size+at(i-1)])/(2*cell);
    const hz=(h[at(j+1)*size+i]-h[at(j-1)*size+i])/(2*cell);
    const inv=1/Math.hypot(hx,1,hz);
    const cav=h[k]-mean[k];
    cavMax=Math.max(cavMax,Math.abs(cav));
    out[k*3]=Math.round((-hx*inv*.5+.5)*255);
    out[k*3+1]=Math.round((-hz*inv*.5+.5)*255);
    out[k*3+2]=Math.round(Math.max(0,Math.min(1,.5+cav/.5))*255);
  }
  return cavMax;
}

function hillshade(h,size,cell,x0,z0,w,out,ow){
  const L=[-.55,.62,-.56],ll=Math.hypot(...L);
  const s=w/ow;
  for(let j=0;j<ow;j++)for(let i=0;i<ow;i++){
    const x=Math.min(size-2,Math.max(1,Math.round(x0+(i+.5)*s))),z=Math.min(size-2,Math.max(1,Math.round(z0+(j+.5)*s)));
    const hx=(h[z*size+x+1]-h[z*size+x-1])/(2*cell),hz=(h[(z+1)*size+x]-h[(z-1)*size+x])/(2*cell);
    const inv=1/Math.hypot(hx,1,hz);
    const d=(-hx*L[0]+L[1]-hz*L[2])*inv/ll;
    out[j*ow+i]=Math.round(Math.max(0,Math.min(1,.12+.88*d))*255);
  }
}

async function main(){
  const args=process.argv.slice(2),arg=(k,d)=>{const i=args.indexOf(k);return i>=0?args[i+1]:d;};
  const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const OUT=path.resolve(ROOT,arg('--out','public/game3d/landscape'));
  const PREVIEW=arg('--preview',null)&&path.resolve(ROOT,arg('--preview'));
  const CACHE=path.resolve(ROOT,arg('--cache','.landscape-harness/macro-height-cache.f32'));
  const t0=performance.now();
  const log=(...a)=>console.log(`[macro ${((performance.now()-t0)/1000).toFixed(1)}s]`,...a);
  let sharp;
  try{sharp=(await import('sharp')).default;}catch{throw Error('bake-wolfveil-terrain-macro needs the sharp package (npm i -D sharp)');}
  const checksum=wolfveilTerrainMacroChecksum(wolfveilHeight);
  // 1) The "high-poly" surface: the shared height function at 0.54 m.
  let hN=null;
  if(fs.existsSync(CACHE)&&fs.existsSync(CACHE+'.json')){
    const meta=JSON.parse(fs.readFileSync(CACHE+'.json','utf8'));
    if(meta.checksum===checksum&&meta.size===N){
      const b=fs.readFileSync(CACHE);hN=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+N*N*4));
      log('height cache hit',checksum);
    }
  }
  if(!hN){
    hN=await parallel('height',N,1);
    fs.mkdirSync(path.dirname(CACHE),{recursive:true});
    fs.writeFileSync(CACHE,Buffer.from(hN.buffer));
    fs.writeFileSync(CACHE+'.json',JSON.stringify({checksum,size:N}));
    log('evaluated heights',N+'x'+N);
  }
  // 2) Where erosion may cut (ranges) and where scree may settle.
  const mk=await parallel('mask',K,2);
  const mountain=resample(mk,K,E,2,0),allow=resample(mk,K,E,2,1);
  log('masks');
  // 3) Erosion on the 1.07 m grid (2x2 means of the high-res field).
  const hE=new Float32Array(E*E);
  for(let j=0;j<E;j++)for(let i=0;i<E;i++){
    const a=2*j*N+2*i;hE[j*E+i]=(hN[a]+hN[a+1]+hN[a+N]+hN[a+N+1])*.25;
  }
  const base=hE.slice();
  let mountainCells=0;for(const m of mountain)mountainCells+=m;
  const droplets=Number(arg('--droplets',Math.round(mountainCells*1.1)));
  const {flow,spawned,steps}=erode(hE,mountain,allow,E,{droplets});
  log('erosion',spawned,'droplets',steps,'steps');
  // Soft-limit the shading detail so it never contradicts the mesh.
  // A 3x3 binomial pass removes single-cell brush speckle first.
  const raw=new Float32Array(E*E);
  for(let j=0;j<E;j++)for(let i=0;i<E;i++){
    let s=0,w=0;
    for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){
      const ii=i+a,jj=j+b;if(ii<0||jj<0||ii>=E||jj>=E)continue;
      const k=(2-Math.abs(a))*(2-Math.abs(b)),c=jj*E+ii;s+=(hE[c]-base[c])*k;w+=k;
    }
    raw[j*E+i]=s/w;
  }
  // Detail only: the broad lowering is high-passed away (the mesh carries
  // the low frequencies), then an automatic gain sets gully depth to ~2 m.
  const low=boxBlur(boxBlur(raw,E,8),E,8),hp=new Float32Array(E*E);
  for(let k=0;k<hp.length;k++)hp[k]=raw[k]-low[k];
  const inMountain=k=>mountain[k]>.3;
  const hpAbs=Float32Array.from(hp,Math.abs);
  const gain=Math.min(1,2.2/Math.max(1e-6,percentile(hpAbs,.99,inMountain)));
  const delta=new Float32Array(E*E),ERODE_MAX=2.6,DEPOSIT_MAX=1.3;
  for(let k=0;k<delta.length;k++){
    const d=hp[k]*gain;
    delta[k]=d<0?-ERODE_MAX*Math.tanh(-d/ERODE_MAX):DEPOSIT_MAX*Math.tanh(d/DEPOSIT_MAX);
  }
  const stats={
    droplets:spawned,steps,gain:+gain.toFixed(4),
    rawErodedP90:+(-percentile(raw,.10,inMountain)).toFixed(3),
    erodedP99:+(-percentile(delta,.01,inMountain)).toFixed(3),
    erodedP90:+(-percentile(delta,.10,inMountain)).toFixed(3),
    depositedP99:+percentile(delta,.99,inMountain).toFixed(3),
  };
  log('delta',stats);
  // 4) Final high-res surface = analytic + eroded detail (Catmull-Rom 2x).
  const dN=upsample2x(delta,E),hF=new Float32Array(N*N);
  for(let k=0;k<hF.length;k++)hF[k]=hN[k]+dN[k];
  // 5) Normal + cavity map (2048).
  const nrm=new Uint8Array(N*N*3);
  const cavMax=normalsAndCavity(hF,N,SPAN/N,nrm);
  // 6) Mask map (1024): sky AO, water flow, deposits.
  const hFE=new Float32Array(E*E);for(let k=0;k<hFE.length;k++)hFE[k]=base[k]+delta[k];
  const ao=skyOcclusion(hFE,E,SPAN/E);
  const flowRef=Math.log1p(percentile(flow,.995,k=>flow[k]>0))||1;
  const msk=new Uint8Array(E*E*3);
  for(let k=0;k<E*E;k++){
    const f=Math.min(1,Math.log1p(flow[k])/flowRef)*smooth(.03,.3,mountain[k]);
    msk[k*3]=Math.round(Math.max(0,Math.min(1,ao[k]))*255);
    msk[k*3+1]=Math.round(f*255);
    msk[k*3+2]=Math.round(Math.max(0,Math.min(1,(raw[k]-.2)/1.6))*allow[k]*255);
  }
  log('maps; cavity max',cavMax.toFixed(3),'m');
  fs.mkdirSync(OUT,{recursive:true});
  const nUrl=path.join(OUT,path.basename(M.normalUrl)),mUrl=path.join(OUT,path.basename(M.maskUrl));
  await sharp(Buffer.from(nrm.buffer),{raw:{width:N,height:N,channels:3}}).webp({quality:90,effort:6}).toFile(nUrl);
  await sharp(Buffer.from(msk.buffer),{raw:{width:E,height:E,channels:3}}).webp({quality:88,effort:6}).toFile(mUrl);
  const meta={
    revision:M.revision,generatedBy:'scripts/bake-wolfveil-terrain-macro.mjs',
    span:SPAN,normalSize:N,maskSize:E,orientation:'row 0 = local z min, column 0 = x min (flipY false)',
    checksum,erosion:stats,
    bytes:{normal:fs.statSync(nUrl).size,mask:fs.statSync(mUrl).size},
  };
  fs.writeFileSync(path.join(OUT,M.metaFile),JSON.stringify(meta,null,2)+'\n');
  log('wrote',meta.bytes);
  if(PREVIEW){
    fs.mkdirSync(PREVIEW,{recursive:true});
    // Before/after hillshade of the most-eroded 300 m window.
    let best=0,bx=0,bz=0;const win=Math.round(300/(SPAN/N)),stride=64;
    for(let z=0;z+win<N;z+=stride)for(let x=0;x+win<N;x+=stride){
      let s=0;for(let j=z;j<z+win;j+=16)for(let i=x;i<x+win;i+=16)s+=Math.abs(dN[j*N+i]);
      if(s>best){best=s;bx=x;bz=z;}
    }
    const ow=900,pair=new Uint8Array(ow*2*ow+0);
    const a=new Uint8Array(ow*ow),b=new Uint8Array(ow*ow);
    hillshade(hN,N,SPAN/N,bx,bz,win,a,ow);hillshade(hF,N,SPAN/N,bx,bz,win,b,ow);
    for(let j=0;j<ow;j++){pair.set(a.subarray(j*ow,(j+1)*ow),j*ow*2);pair.set(b.subarray(j*ow,(j+1)*ow),j*ow*2+ow);}
    // Flip vertically so north (+z... local z max) is up in the preview.
    const flip=new Uint8Array(pair.length);
    for(let j=0;j<ow;j++)flip.set(pair.subarray(j*ow*2,(j+1)*ow*2),(ow-1-j)*ow*2);
    await sharp(Buffer.from(flip.buffer),{raw:{width:ow*2,height:ow,channels:1}}).jpeg({quality:86})
      .toFile(path.join(PREVIEW,'terrain-macro-erosion-before-after.jpg'));
    // Whole-map shaded relief with flow (blue) and scree deposits (amber).
    const fw=1024,rel=new Uint8Array(fw*fw),rgb=new Uint8Array(fw*fw*3);
    hillshade(hF,N,SPAN/N,0,0,N,rel,fw);
    for(let j=0;j<fw;j++)for(let i=0;i<fw;i++){
      const k=j*fw+i,src=((fw-1-j)*fw+i),e=src;// fw === E
      const g=rel[src]/255*(.55+.45*msk[e*3]/255),f=msk[e*3+1]/255,d=msk[e*3+2]/255;
      rgb[k*3]=Math.round(Math.min(1,g*(1-f*.5)+d*.45)*255);
      rgb[k*3+1]=Math.round(Math.min(1,g*(1-f*.3)+d*.28)*255);
      rgb[k*3+2]=Math.round(Math.min(1,g+f*.35)*255);
    }
    await sharp(Buffer.from(rgb.buffer),{raw:{width:fw,height:fw,channels:3}}).jpeg({quality:86})
      .toFile(path.join(PREVIEW,'terrain-macro-relief-flow.jpg'));
    log('previews; window at',bx,bz);
  }
  log('done');
}
