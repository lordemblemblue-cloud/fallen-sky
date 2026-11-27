import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConduitRouteResolver} from '../src/components/duelist/sim/conduitRouteResolver.mjs';
import {snapshotConduitCollision,probeConduitWalk} from '../src/components/duelist/sim/conduitTraversal.mjs';
const makeWorld=(wall=true)=>snapshotConduitCollision({
  obbs:wall?[{cx:0,cy:-3.8,cz:0,hx:.3,hy:1.2,hz:1.5,cos:1,sin:0,walkable:false,label:'wall'}]:[],
  discs:[{cx:0,cz:0,radius:8,yMin:-5.5,yMax:-5,walkable:true,cutouts:[]}],
  ramps:[],cylinders:[],annuli:[],shaftOpenings:[],jumpPads:[]
});
const makeNodes=(type='walk')=>new Map([['a',{pos:{x:-3,y:-5,z:0},edges:[{to:'b',type}]}],['b',{pos:{x:3,y:-5,z:0},edges:[{to:'a',type}]}]]);
test('walking detour physically passes around a wall in both directions',()=>{
  const world=makeWorld(),nodes=makeNodes(),resolver=createConduitRouteResolver(world,nodes);
  assert.equal(probeConduitWalk(world,nodes.get('a').pos,nodes.get('b').pos).ok,false);
  for(const [a,b] of [['a','b'],['b','a']]){
    const route=resolver.resolveEdge(a,b);
    assert.equal(route.ok,true);assert.equal(route.detour,true);assert.ok(route.points.length>2);
    assert.ok(route.points.every(p=>p.y===-5));
    for(let i=1;i<route.points.length;i++)assert.equal(probeConduitWalk(world,route.points[i-1],route.points[i]).ok,true);
    assert.equal(resolver.findRoute(a,b).segments.length,1);
  }
});
test('direct routes stay direct; uncertified drop and missing edges are rejected',()=>{
  const resolver=createConduitRouteResolver(makeWorld(false),makeNodes());
  assert.equal(resolver.resolveEdge('a','b').detour,false);
  assert.equal(resolver.resolveEdge('a','missing').ok,false);
  assert.equal(createConduitRouteResolver(makeWorld(),makeNodes('drop')).findRoute('a','b'),null);
});
test('no detour through an impassable wall or unsupported floor',()=>{
  const world=snapshotConduitCollision({obbs:[{cx:0,cy:-3.8,cz:0,hx:.3,hy:1.2,hz:20,cos:1,sin:0,label:'sealed wall'}],discs:[{cx:0,cz:0,radius:5,yMin:-5.5,yMax:-5,walkable:true}],ramps:[],cylinders:[],annuli:[],shaftOpenings:[],jumpPads:[]});
  const r=createConduitRouteResolver(world,makeNodes());
  assert.equal(r.resolveEdge('a','b').ok,false);assert.equal(r.findRoute('a','b'),null);
});
