// Reproducible item art: three independent SVGs per original item motif.
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const input=join(root,'public/duelist/items'),output=join(root,'public/duelist/item-tiers');
const palette=[null,['#d5b17d','#614c38'],['#c3d8e7','#344d69'],['#a7ddff','#1252a1']];
const romans=['','I','II','III'];
export function tierSvg(id,source,tier){
 const [accent,shade]=palette[tier],size=[0,76,86,96][tier],inset=(112-size)/2;
 const motif=source.replace(/<svg\b[^>]*>/,'<svg x="'+inset+'" y="'+inset+'" width="'+size+'" height="'+size+'" viewBox="0 0 72 72">');
 const seed=[...id].reduce((a,c)=>((a*31+c.charCodeAt(0))>>>0),0);
 const stars=Array.from({length:tier+2},(_,i)=>{const a=(seed%360+i*360/(tier+2))*Math.PI/180,x=56+44*Math.cos(a),y=56+44*Math.sin(a);return '<path d="M'+x.toFixed(1)+' '+(y-2).toFixed(1)+' l2 2 -2 2 -2 -2Z" fill="'+accent+'" opacity=".8"/>';}).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112" role="img" aria-label="'+id+' tier '+romans[tier]+'"><defs><radialGradient id="tierAura"><stop stop-color="'+shade+'"/><stop offset="1" stop-color="#08121f" stop-opacity=".88"/></radialGradient><filter id="tierFinish"><feColorMatrix type="saturate" values="'+[0,.48,.85,1.22][tier]+'"/></filter></defs><path d="M12 2H100L110 12V100L100 110H12L2 100V12Z" fill="url(#tierAura)" stroke="'+accent+'" stroke-width="'+(tier===3?2:1)+'"/><g filter="url(#tierFinish)">'+motif+'</g><path d="M8 20V12L12 8H26M86 8H100L104 12V20M8 92V100L12 104H26M86 104H100L104 100V92" fill="none" stroke="'+accent+'" stroke-opacity=".65"/>'+(tier>=2?'<circle cx="56" cy="56" r="48" fill="none" stroke="'+accent+'" stroke-opacity=".2" stroke-dasharray="3 7"/>':'')+stars+'<path d="M39 91H73L79 97L73 105H39L33 97Z" fill="#07101e" stroke="'+accent+'" stroke-width=".8"/><text x="56" y="101" font-family="Georgia,serif" font-size="10" font-weight="bold" text-anchor="middle" fill="'+accent+'">'+romans[tier]+'</text></svg>\n';
}
mkdirSync(output,{recursive:true});
for(const file of readdirSync(input).filter(x=>/^[a-z0-9]+\.svg$/.test(x)).sort()){
 const id=file.slice(0,-4),source=readFileSync(join(input,file),'utf8');
 for(const tier of [1,2,3])writeFileSync(join(output,id+'-'+tier+'.svg'),tierSvg(id,source,tier));
}
