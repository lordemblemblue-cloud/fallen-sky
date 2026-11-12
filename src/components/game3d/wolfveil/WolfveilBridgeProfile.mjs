// Wolfveil Play-world bridge profile: terrain contact is shared by the
// visual planks and the client foot-ray surface. Server authority is separate.
export const WOLFVEIL_BRIDGE_CLEARANCE_METERS = 0.16;
export const WOLFVEIL_BRIDGE_MAX_GRADE = 0.48;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

export function projectWolfveilBridgePoint(bridge,x,z){
  const [ax,az]=bridge.from,[bx,bz]=bridge.to;
  const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
  if(!(len>0))throw Error('Wolfveil bridge requires two distinct shores');
  const t=((x-ax)*dx+(z-az)*dz)/(len*len);
  const lateral=((x-ax)*(-dz)+(z-az)*dx)/len;
  return {t,lateral,len};
}

export function planWolfveilBridgeDeck(bridge,sampleGround,{stepMeters=.75,clearance=WOLFVEIL_BRIDGE_CLEARANCE_METERS}={}){
  if(!bridge?.id||!Array.isArray(bridge.from)||!Array.isArray(bridge.to)||
     !(bridge.width>1)||typeof sampleGround!=='function'||!(stepMeters>.2&&stepMeters<=2)||
     !(clearance>=.08&&clearance<=.6))throw Error('Invalid Wolfveil bridge plan');
  const [ax,az]=bridge.from,[bx,bz]=bridge.to;
  const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
  if(!(len>1))throw Error('Wolfveil bridge length must exceed 1 metre');
  const forwardX=dx/len,forwardZ=dz/len;
  const rightX=-forwardZ,rightZ=forwardX;
  const offsets=Array.from({length:5},(_,i)=>(i/4-.5)*bridge.width);
  const groundAt=(t,lateral)=>{
    const x=ax+dx*t+rightX*lateral,z=az+dz*t+rightZ*lateral;
    const y=sampleGround(x,z);
    if(!Number.isFinite(y))throw Error('Bridge ground surface missing at '+bridge.id);
    return y;
  };
  // A bridge is ONE level cross-section, not five separately graded
  // footpaths. Previously the higher right bank lifted only the right edge:
  // Market Stone Bridge twisted 3.59 metres sideways across its 6m deck.
  // Sample the full-width terrain, choose the highest contact per station,
  // and apply one height to ALL lanes. Stone abutments support lower banks.
  const startTop=Math.max(...offsets.map(o=>groundAt(0,o)));
  const endTop=Math.max(...offsets.map(o=>groundAt(1,o)));
  const steps=Math.ceil(len/stepMeters);
  const centerline=Array.from({length:steps+1},(_,i)=>{
    const t=i/steps,arc=.72*Math.sin(Math.PI*t);
    const allLaneGround=Math.max(...offsets.map(o=>groundAt(t,o)));
    return Math.max(
      lerp(startTop,endTop,t)+clearance+arc,
      allLaneGround+clearance,
    );
  });
  // Bound the LONGITUDINAL grade, without adding any transverse roll.
  const stride=len/steps,maxRise=WOLFVEIL_BRIDGE_MAX_GRADE*stride;
  for(let i=1;i<=steps;i++)
    centerline[i]=Math.max(centerline[i],centerline[i-1]-maxRise);
  for(let i=steps-1;i>=0;i--)
    centerline[i]=Math.max(centerline[i],centerline[i+1]-maxRise);
  const rows=centerline.map(y=>offsets.map(()=>y));
  function heightAt(t,lateral=0){
    const tt=clamp(t,0,1),ss=clamp(lateral,-bridge.width/2,bridge.width/2);
    const q=tt*steps,i=Math.min(steps-1,Math.floor(q)),u=q-i;
    const w=(ss/bridge.width+.5)*4,j=Math.min(3,Math.floor(w)),v=w-j;
    return lerp(lerp(rows[i][j],rows[i][j+1],v),
      lerp(rows[i+1][j],rows[i+1][j+1],v),u);
  }
  function pointAt(t,lateral=0){
    return [ax+dx*t+rightX*lateral,heightAt(t,lateral),
      az+dz*t+rightZ*lateral];
  }
  let worstGrade=0;
  for(let i=0;i<steps;i++)for(let k=0;k<offsets.length;k++)
    worstGrade=Math.max(worstGrade,Math.abs(rows[i+1][k]-rows[i][k])/stride);
  return {id:bridge.id,bridge,width:bridge.width,len,steps,offsets,rows,
    clearance,worstGrade,pointAt,heightAt,groundAt};
}

export function wolfveilRockOverlapsBridgeLane(rock,bridges,{margin=1.4}={}){
  if(!rock||!Number.isFinite(rock.x)||!Number.isFinite(rock.z)||
     !Number.isFinite(rock.sx)||!Number.isFinite(rock.sz))return false;
  const rockRadius=Math.max(rock.sx,rock.sz)*1.12;
  for(const bridge of bridges){
    const {t,lateral,len}=projectWolfveilBridgePoint(bridge,rock.x,rock.z);
    if(t < -(rockRadius+margin)/len||t>1+(rockRadius+margin)/len)continue;
    if(Math.abs(lateral) < bridge.width/2+rockRadius+margin)return true;
  }
  return false;
}

// Client-side last-step railing guard; a trusted multiplayer movement
// equivalent still requires an independent server-side implementation.
export function resolveWolfveilBridgeRailing(position,previous,bridges,radius=.62,viewerOffsetZ=0){
  if(!position||!previous||!(radius>0))return false;
  for(const bridge of bridges){
    const prev=projectWolfveilBridgePoint(bridge,previous.x,previous.z-viewerOffsetZ);
    const now=projectWolfveilBridgePoint(bridge,position.x,position.z-viewerOffsetZ);
    const half=bridge.width/2;
    if(prev.t<.03||prev.t>.97||now.t<.03||now.t>.97||
       Math.abs(prev.lateral)>half-radius*.35)continue;
    const limit=Math.max(.15,half-radius);
    const constrained=clamp(now.lateral,-limit,limit);
    if(constrained===now.lateral)continue;
    const dx=bridge.to[0]-bridge.from[0],dz=bridge.to[1]-bridge.from[1];
    const len=Math.hypot(dx,dz);
    const change=constrained-now.lateral;
    position.x+=(-dz/len)*change;
    position.z+=(dx/len)*change;
    return true;
  }
  return false;
}
