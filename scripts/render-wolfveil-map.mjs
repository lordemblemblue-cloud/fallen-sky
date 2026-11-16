#!/usr/bin/env node
/* global process, Buffer, URL, console */
// Renders the Wolfveil landscape map from the REAL shared terrain functions:
//   public/game3d/maps/wolfveil-landscape-v1.png   (minimap / world-map underlay)
//   docs/game3d/landscaping/WOLFVEIL_MAP_DESIGN_20261116.svg (annotated design,
//   vector; references the public underlay above)
// Usage: node scripts/render-wolfveil-map.mjs [--size 640]
// North is up; the image covers WOLFVEIL_MAP_WORLD_BOUNDS (Play coordinates).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  wolfveilHeight,wolfveilDistanceToRiver,wolfveilRouteClearance,WOLFVEIL_RIVER,
} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {isVortexLakeWetSurface} from '../src/components/game3d/wolfveil/VortexLakeLayout.mjs';
import {wolfveilLandscapeSurface} from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
import {
  WOLFVEIL_MAP_WORLD_BOUNDS as B,WOLFVEIL_MAP_ROADS,WOLFVEIL_MAP_RIVER,WOLFVEIL_MAP_BRIDGES,
  WOLFVEIL_MAP_RANGES,WOLFVEIL_MAP_FIGHTING_GROUNDS,WOLFVEIL_MAP_MOB_AREAS,
  WOLFVEIL_MAP_SAFE_ZONES,WOLFVEIL_MAP_LANDMARKS,WOLFVEIL_MAP_SUMMITS,WOLFVEIL_MAP_LEGEND,
  WOLFVEIL_MAP_UNDERLAY,WOLFVEIL_MAP_REVISION,projectWolfveilMap,
} from '../src/components/game3d/wolfveil/WolfveilMapDesign.mjs';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')),'..');
const arg=process.argv.indexOf('--size');
const SIZE=arg>0?Number(process.argv[arg+1]):WOLFVEIL_MAP_UNDERLAY.pixels;
const OFFSET_Z=70;

const toSrgb=c=>{const v=Math.max(0,Math.min(1,c));
  return v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;};

function renderUnderlay(){
  const metres=(B.maxX-B.minX)/SIZE;
  const rgb=new Uint8Array(SIZE*SIZE*3);
  const light=normalize([-.55,.75,.36]); // sun from the north-west, map convention
  for(let py=0;py<SIZE;py++){
    const zw=B.maxZ-(py+.5)*metres,z=zw-OFFSET_Z;
    for(let px=0;px<SIZE;px++){
      const x=B.minX+(px+.5)*metres;
      const h=wolfveilHeight(x,z);
      const e=1.6;
      const hx=wolfveilHeight(x+e,z)-wolfveilHeight(x-e,z);
      const hz=wolfveilHeight(x,z+e)-wolfveilHeight(x,z-e);
      const slope=Math.hypot(hx,hz)/(2*e);
      // 2.2x vertical exaggeration so gentle valley relief still reads.
      const n=normalize([-2.2*hx/(2*e),1,-2.2*hz/(2*e)]);
      const river=wolfveilDistanceToRiver(x,z);
      let color;
      if(river<WOLFVEIL_RIVER.width*.5-.5||isVortexLakeWetSurface(x,z,0)){
        const deep=Math.max(0,Math.min(1,1-river/(WOLFVEIL_RIVER.width*.5)));
        color=[.035+.03*(1-deep),.11+.05*(1-deep),.15+.04*(1-deep)];
      }else{
        color=wolfveilLandscapeSurface(x,z,h,slope,{riverDistance:river,
          routeClearance:wolfveilRouteClearance(x,z),west:Math.max(0,Math.min(1,(-x-90)/260))}).color;
      }
      // Hillshade + gentle altitude tint, and faint 25 m contours.
      const lambert=Math.max(0,n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
      const shade=.42+.85*lambert;
      const contour=Math.abs(((h%25)+25)%25-12.5)>11.9?.86:1;
      const i=(py*SIZE+px)*3;
      for(let k=0;k<3;k++)rgb[i+k]=Math.round(255*toSrgb(color[k]*shade*contour*1.55));
    }
  }
  return rgb;
}
function normalize(v){const l=Math.hypot(...v)||1;return v.map(c=>c/l);}

// Minimal PNG encoder (RGB, 8-bit, filter 0).
function crcTable(){const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;}
const CRC=crcTable();
function crc32(buf){let c=0xffffffff;for(const b of buf)c=CRC[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type,'ascii'),data]);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len,td,crc]);
}
function encodePng(rgb,w,h){
  const raw=Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;Buffer.from(rgb.buffer,y*w*3,w*3).copy(raw,y*(w*3+1)+1);}
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

// Annotated vector design (same layers as the in-game world map).
function designSvg(underlayHref){
  const S=1000,P=(x,z)=>projectWolfveilMap(x,z,S);
  const line=(pts)=>pts.map(([x,z])=>{const p=P(x,z);return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
  const m=S/(B.maxX-B.minX);
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const label=(x,y,text,size=15,fill='#fff6e4')=>`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="middle" stroke="#13202b" stroke-width="4" paint-order="stroke" font-family="Georgia,serif">${esc(text)}</text>`;
  const out=[];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${S+320} ${S}" width="${S+320}" height="${S}">`);
  out.push(`<rect width="${S+320}" height="${S}" fill="#0f1a23"/>`);
  out.push(`<image href="${underlayHref}" xlink:href="${underlayHref}" x="0" y="0" width="${S}" height="${S}"/>`);
  for(const r of WOLFVEIL_MAP_RANGES.filter(r=>!r.outer))
    out.push(`<polyline points="${line(r.spine)}" fill="none" stroke="#e7ecef" stroke-opacity=".55" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>`);
  for(const z of WOLFVEIL_MAP_SAFE_ZONES){const p=P(z.x,z.z);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="${z.radius*m}" fill="#7fd18a" fill-opacity=".10" stroke="#7fd18a" stroke-width="2" stroke-dasharray="6 6"/>`);}
  out.push(`<polyline points="${line(WOLFVEIL_MAP_RIVER.points)}" fill="none" stroke="#6fb7d8" stroke-width="${(WOLFVEIL_MAP_RIVER.width*m).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`);
  for(const r of WOLFVEIL_MAP_ROADS){
    const frontier=r.kind==='frontier';
    out.push(`<polyline points="${line(r.points)}" fill="none" stroke="${frontier?'#e9c9a0':'#d8c3a0'}" stroke-width="${Math.max(2.2,r.width*m*1.4).toFixed(1)}" ${frontier?'stroke-dasharray="9 6"':''} stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  for(const b of WOLFVEIL_MAP_BRIDGES){const a=P(...b.from),c=P(...b.to);
    out.push(`<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#a37a52" stroke-width="5"/>`);}
  for(const f of WOLFVEIL_MAP_FIGHTING_GROUNDS){const p=P(f.x,f.z);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="${f.radius*m}" fill="#f2c46b" fill-opacity=".16" stroke="#f2c46b" stroke-width="3"/>`);
    out.push(`<text x="${p.x}" y="${p.y+7}" font-size="22" text-anchor="middle" fill="#f2c46b">⚔</text>`);
    out.push(label(p.x,p.y-f.radius*m-8,f.name,15,'#ffe2a6'));}
  for(const mob of WOLFVEIL_MAP_MOB_AREAS){const p=P(mob.x,mob.z);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="${Math.max(9,mob.radius*m)}" fill="#e5675f" fill-opacity=".22" stroke="#e5675f" stroke-width="2.5"/>`);
    out.push(label(p.x,p.y+Math.max(9,mob.radius*m)+15,mob.name+' · '+mob.label,12,'#ffd0c9'));}
  for(const s of WOLFVEIL_MAP_SUMMITS){const p=P(s.x,s.z);
    if(p.y<28||p.y>S||p.x<40||p.x>S-40)continue;
    out.push(`<path d="M${p.x-8} ${p.y+6} L${p.x} ${p.y-8} L${p.x+8} ${p.y+6} Z" fill="#eef3f6" stroke="#1d2a33" stroke-width="1.5"/>`);
    out.push(label(p.x,p.y-12,s.name,13,'#eef3f6'));}
  for(const l of WOLFVEIL_MAP_LANDMARKS){const p=P(l.x,l.z);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#b4d9e9" stroke="#13202b" stroke-width="1.5"/>`);}
  for(const z of WOLFVEIL_MAP_SAFE_ZONES){const p=P(z.x,z.z);out.push(label(p.x,p.y-z.radius*m+18,z.name,14,'#c9f3cf'));}
  const rangeLabels=[['Wolf-Ear Range',0,560],['Cedar Spine',-470,90],['Highfall Range',478,140],['Southern Downs',-120,-450]];
  for(const [name,x,z] of rangeLabels){const p=P(x,z);out.push(label(p.x,p.y,name,17,'#eef3f6'));}
  {const p=P(150,-210);out.push(label(p.x,p.y,'Silverrun River',14,'#bfe6f6'));}
  // Legend panel.
  out.push(`<rect x="${S+16}" y="16" width="288" height="${S-32}" rx="10" fill="#15222d" stroke="#3c5568"/>`);
  out.push(`<text x="${S+32}" y="52" font-size="22" fill="#f5ead6" font-family="Georgia,serif">Wolfveil · Landscape Map</text>`);
  out.push(`<text x="${S+32}" y="76" font-size="12" fill="#9fb5c4" font-family="Georgia,serif">${esc(WOLFVEIL_MAP_REVISION)}</text>`);
  WOLFVEIL_MAP_LEGEND.forEach((l,i)=>{const y=110+i*34;
    out.push(`<rect x="${S+32}" y="${y-13}" width="18" height="18" rx="3" fill="${l.color}"/>`);
    out.push(`<text x="${S+60}" y="${y+1}" font-size="13" fill="#e6edf2" font-family="Georgia,serif">${esc(l.label)}</text>`);});
  const notes=['North is up. 1,100 m playable square.','Ranges ring the valley: the edge','of the world is a mountain wall.','Hunter\'s Loop: Lv 3 (south-east)','→ east → highlands → Lv 50 (south-west).','Fighting grounds: level, open,','framed by berms & standing stones.','Mob camps: rocky hollows with one','open mouth facing their trail.'];
  notes.forEach((t,i)=>out.push(`<text x="${S+32}" y="${380+i*22}" font-size="13" fill="#c7d5df" font-family="Georgia,serif">${esc(t)}</text>`));
  out.push('</svg>');
  return out.join('\n');
}

const t0=Date.now();
const rgb=renderUnderlay();
const png=encodePng(rgb,SIZE,SIZE);
const pub=path.join(root,'public',WOLFVEIL_MAP_UNDERLAY.url.replace(/^\//,''));
fs.mkdirSync(path.dirname(pub),{recursive:true});
fs.writeFileSync(pub,png);
const docs=path.join(root,'docs','game3d','landscaping');
fs.mkdirSync(docs,{recursive:true});
// The SVG references the one shipped underlay (no duplicate image in docs).
fs.writeFileSync(path.join(docs,'WOLFVEIL_MAP_DESIGN_20261116.svg'),
  designSvg('../../../public'+WOLFVEIL_MAP_UNDERLAY.url));
console.log(JSON.stringify({size:SIZE,bytes:png.length,ms:Date.now()-t0,underlay:pub}));
