// Reusable room module contracts for Wolfveil's interchangeable dungeon layout.
// The shared cave renderer still owns mesh construction; this file defines
// stable footprints and doorway sockets so layout variants can be swapped
// without hand-editing every room's dimensions and connector openings.

const freezePorts = ports => Object.freeze(ports.map(port=>Object.freeze({
  ...port,
  normal:Object.freeze([...port.normal]),
})));

export const WOLFVEIL_ROOM_MODULES=Object.freeze({
  small_round:Object.freeze({
    id:'small_round',shape:'radial',radius:8,ceiling:7.2,
    socketWidth:5.1,socketHeight:6.4,ports:Object.freeze(['west','north']),
  }),
  treasure_vault:Object.freeze({
    id:'treasure_vault',shape:'radial',radius:12,ceiling:7.8,
    socketWidth:4.84,socketHeight:5.2,ports:Object.freeze(['east']),
  }),
  reliquary:Object.freeze({
    id:'reliquary',shape:'radial',radius:13,ceiling:8.2,
    socketWidth:4.84,socketHeight:5.8,ports:Object.freeze(['west']),
  }),
  echo_gallery:Object.freeze({
    id:'echo_gallery',shape:'radial',radius:14,ceiling:8.6,
    socketWidth:4.84,socketHeight:5.6,ports:Object.freeze(['north','west']),
  }),
  crossroads:Object.freeze({
    id:'crossroads',shape:'radial',radius:18,ceiling:12,
    socketWidth:5.1,socketHeight:6.4,
    ports:Object.freeze(['north','east','south','west']),
  }),
  sanctuary:Object.freeze({
    id:'sanctuary',shape:'radial',radius:22,ceiling:15,
    socketWidth:5.4,socketHeight:7.1,ports:Object.freeze(['south']),
  }),
});

const DIRECTIONS=Object.freeze({
  north:Object.freeze([0,-1]),
  east:Object.freeze([1,0]),
  south:Object.freeze([0,1]),
  west:Object.freeze([-1,0]),
});

function rotate([x,z],quarterTurns){
  switch(((quarterTurns%4)+4)%4){
    case 1:return [-z,x];
    case 2:return [-x,-z];
    case 3:return [z,-x];
    default:return [x,z];
  }
}

// Build an immutable room instance from a reusable footprint. quarterTurns
// rotates its doorway sockets in 90-degree steps; radial room geometry itself
// remains rotationally symmetric in the shared cave renderer.
export function instantiateWolfveilRoomModule(moduleId,{
  id,name,x,y,z,quarterTurns=0,theme=null,kind=null,type=null,
}={}){
  const module=WOLFVEIL_ROOM_MODULES[moduleId];
  if(!module)throw new RangeError(`Unknown Wolfveil room module: ${moduleId}`);
  if(!id||![x,y,z].every(Number.isFinite))
    throw new TypeError('Wolfveil room instances need an id and finite x/y/z');
  if(!Number.isInteger(quarterTurns))
    throw new TypeError('Wolfveil room quarterTurns must be an integer');
  const ports=freezePorts(module.ports.map(direction=>{
    const normal=rotate(DIRECTIONS[direction],quarterTurns);
    const reach=module.radius+0.9;
    return {
      id:direction,
      x:x+normal[0]*reach,
      y:y+module.socketHeight*0.5,
      z:z+normal[1]*reach,
      normal,
      width:module.socketWidth,
      height:module.socketHeight,
    };
  }));
  return Object.freeze({
    id,name:name||id,moduleId,shape:module.shape,
    x,y,z,radius:module.radius,ceiling:module.ceiling,
    quarterTurns:((quarterTurns%4)+4)%4,
    theme,kind,type,ports,
  });
}
