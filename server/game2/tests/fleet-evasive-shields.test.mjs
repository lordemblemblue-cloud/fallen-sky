import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_CLASSES, SHIP_SHIELD_SKILL } from '../fleet/rules.mjs';
import { newFlightState, sanitizeCmd, stepShip } from '../fleet/flight.mjs';
import { createFleetMatch } from '../fleet/match.mjs';
import { len, forwardOf, dot } from '../fleet/vec.mjs';

const sample = (seq, opts={}) => sanitizeCmd({
  seq, ms:16, pitch:0, yaw:0, roll:0, throttle:1,
  boost:false, fire:false, barrel:0, engineOff:false, shield:false, ...opts,
});

test('server command parser enforces boolean engine cutoff and bounded one-shot rolls',()=>{
  assert.equal(sample(1,{engineOff:true,barrel:1,shield:true}).engineOff,true);
  assert.equal(sample(1,{engineOff:true,barrel:1,shield:true}).shield,true);
  assert.equal(sample(2,{engineOff:'true',barrel:999,shield:'yes'}).engineOff,false);
  assert.equal(sample(2,{engineOff:'true',barrel:999,shield:'yes'}).barrel,0);
  assert.equal(sample(3,{barrel:-1}).barrel,-1);
  assert.equal(sample(3,{barrel:-1}).shield,false);
  assert.equal(sample(4,{barrel:0.1}).barrel,0);
});

test('cutting engines preserves physical coasting and lets pilot turn around before relighting',()=>{
  const cls=SHIP_CLASSES.fighter;
  const flight=newFlightState(cls);
  for(let i=0;i<120;i++)stepShip(flight,cls,sample(i+1,{engineOff:true,yaw:1}));
  const speed=flight.speed,flightDir=[...flight.v],nose=forwardOf(flight.q);
  assert.equal(flight.engineOff,true);
  assert.ok(speed>cls.minSpeed*.96,'engine cut must preserve momentum rather than stop immediately');
  assert.ok(dot(flightDir,nose) < 0.25*len(flightDir),'coasting ship can point away from its velocity');
  assert.equal(flight.boosting,false);
  for(let i=0;i<90;i++)stepShip(flight,cls,sample(200+i,{engineOff:false,throttle:1}));
  assert.equal(flight.engineOff,false);
  assert.ok(flight.speed>speed,'reignited engines accelerate');
  assert.ok(dot(flight.v,forwardOf(flight.q))>0,'ship begins chasing its reversed nose');
});

test('barrel roll spins the actual ship through ~360 degrees, respects server cooldown',()=>{
  const cls=SHIP_CLASSES.jedi, flight=newFlightState(cls);
  const initial=[...flight.q];
  const angle=n=>2*Math.acos(Math.min(1,Math.abs(n[3])));
  for(let i=0;i<40;i++)stepShip(flight,cls,sample(i+1,{barrel:1}));
  assert.ok(angle(flight.q)<0.12,'full turn returns the craft close to starting orientation');
  assert.ok(flight.barrelCooldown>2.4);
  const before=flight.barrelCooldown;
  stepShip(flight,cls,sample(41,{barrel:-1}));
  assert.ok(flight.barrelCooldown < before,'repeated roll cannot restart during cooldown');
  for(let i=0;i<205;i++)stepShip(flight,cls,sample(i+42));
  assert.equal(flight.barrelCooldown,0);
  stepShip(flight,cls,sample(300,{barrel:-1}));
  assert.ok(flight.barrelRemaining>0 && flight.barrelDir===-1);
  assert.equal(initial.length,4);
});

test('all ship classes launch with real armor shields and server-only rebuff cooldown',()=>{
  let now=1000,seq=0;
  const game=createFleetMatch({now:()=>now, config:{
    fillBots:false,minPlayers:2,maxPlayers:6,warmupMs:0,cruisersPerSide:1,
  }});
  const conn={send(){}};
  game.addHuman({id:'ace',name:'Ace',side:'republic',role:'pilot',conn});
  game.debug.startBattle();
  const me=game.state.players.get('ace');
  const craft=game.state.crafts.get(me.eid);
  assert.ok(craft,'server has an actual player ship');
  assert.equal(craft.shield,SHIP_CLASSES.fighter.shieldMax);
  assert.ok(Object.values(SHIP_CLASSES).every(cls=>cls.shieldMax>0));
  const oldHull=craft.hp;
  game.debug.hitCraft(craft,45,null,'laser');
  assert.equal(craft.hp,oldHull,'shield takes the damage before hull');
  assert.equal(craft.shield,SHIP_CLASSES.fighter.shieldMax-45);
  // Server validates the skill directly against current authoritative values.
  const send=(extras={})=>game.handle('ace',{c:'cmd',cmds:[{
    seq:++seq,ms:16,throttle:.6,shield:true,...extras,
  }]});
  send();
  assert.equal(craft.shield,SHIP_CLASSES.fighter.shieldMax);
  assert.equal(craft.shieldReadyAt,now+SHIP_SHIELD_SKILL.cooldownMs);
  game.debug.hitCraft(craft,35,null,'missile');
  const afterHit=craft.shield;
  send();
  assert.equal(craft.shield,afterHit,'spamming rebuff before cooldown cannot restore shields');
  const snap=game.snapshotFor('ace');
  assert.equal(snap.you.sh,afterHit);
  assert.ok(snap.you.shcd>0 && snap.you.shmax===SHIP_CLASSES.fighter.shieldMax);
  assert.equal(snap.s.find(x=>x[0]===me.eid).at(-1),afterHit);
  now+=SHIP_SHIELD_SKILL.cooldownMs+50;
  send();
  assert.equal(craft.shield,SHIP_CLASSES.fighter.shieldMax);
  game.debug.hitCraft(craft,craft.shield+22,null,'laser');
  assert.equal(craft.shield,0);
  assert.equal(craft.hp,oldHull-22,'overflow damages hull after shield collapse');
});
