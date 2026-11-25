// Legacy Fallen Sky cave/dungeon geometry removed for the owner's clean-slate rebuild.
import {NodeMaterial} from 'three/webgpu';
import * as T from 'three/tsl';
import {uniformOf} from '../../../lib/webgpuNodeKit.js';

// WebGPURenderer: the same portal disc in TSL
export function lunarPortalTwin(classic){
  const time=uniformOf(classic.uniforms.uTime,'float');
  const m=new NodeMaterial();
  m.fragmentNode=T.Fn(()=>{
    const p=T.uv().sub(.5).mul(2).toVar();
    const r=T.length(p).toVar();
    r.greaterThan(1).discard();
    const a=T.atan2(p.y,p.x);
    const spiral=T.sin(a.mul(5).sub(r.mul(23)).sub(time.mul(2.9))).toVar();
    const swirl=T.sin(a.mul(9).add(r.mul(17)).add(time.mul(3.3))).toVar();
    const bright=T.pow(T.max(0,spiral),3).mul(.45).add(T.pow(T.max(0,swirl),6).mul(.27)).toVar();
    const rim=T.pow(T.smoothstep(.61,.99,r),4).toVar();
    const center=T.pow(T.smoothstep(0,.57,r).oneMinus(),2);
    const cyan=T.vec3(.17,.83,1);
    const color=T.mix(T.vec3(.046,.019,.27),T.vec3(.06,.31,.92),T.sin(spiral.add(time.mul(.4))).mul(.42).add(.46)).toVar();
    color.assign(T.mix(color,cyan,T.clamp(bright.add(rim.mul(.57)),0,1)));
    color.addAssign(T.vec3(.52,.18,1).mul(T.pow(T.max(0,swirl),3).mul(.34).add(.16)));
    color.addAssign(cyan.mul(center.mul(.53)));
    return T.vec4(color,T.clamp(rim.mul(.19).add(.78).add(bright.mul(.1)),0,.99));
  })();
  return m;
}
export function createLunarMountainEntrance(){return null;}
export function createLunarCaveDungeon(){return null;}
