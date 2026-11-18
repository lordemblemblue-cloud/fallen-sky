// Kejim Post chapter II: handcrafted districts beyond the original hangar.
// New corridors, industrial platforms, a natural ravine, relay defenses,
// branching prisoner/intelligence annexes and a distant evacuation gantry.
// Coordinates are in Game 2 metres (Y up); no monolithic flat traversable
// ground is placed across the ravine.
export function expandKejimWorld(k) {
  const L=k.L;
  // Tenfold *total environment bounds* versus the original -44..64 / -86..76.
  // The navigable spaces remain intentionally partitioned into actual routes.
  L.groundPatches=[
    {x0:59,z0:-10,x1:98,z1:11,mat:'gratedSteel'},
    {x0:96,z0:-23,x1:135,z1:25,mat:'rivetedSteel'},
    {x0:132,z0:-13,x1:156,z1:18,mat:'gratedSteel'},
    {x0:187,z0:-23,x1:247,z1:85,mat:'strataRock'},
    {x0:167,z0:94,x1:198,z1:127,mat:'rivetedSteel'},
    {x0:194,z0:84,x1:244,z1:129,mat:'rivetedSteel'},
    {x0:238,z0:93,x1:267,z1:127,mat:'rivetedSteel'},
    {x0:194,z0:128,x1:225,z1:158,mat:'strataRock'},
    {x0:192,z0:157,x1:242,z1:190,mat:'strataRock'},
    {x0:190,z0:189,x1:246,z1:228,mat:'strataRock'},
  ];
  // The ravine between foundry and mesa has no walkable ground.
  // Raised fractured boulders and nonuniform rock facets define its sides.
  for(const [x,z,r,h] of [
    [154,-15,4,5.6],[159,-13,6,8.4],[163,-17,5,4.9],
    [169,-19,4,7.7],[175,-17,7,6.6],[181,-14,4,6.3],
    [153,15,4,6.7],[163,19,6,9.2],[169,15,5,7.5],
    [177,17,5,9.9],[185,16,4,6.6],
  ]) k.crag(x,z,r,h,'strataRock');
  // Five offset slabs follow an irregular fracture, not a perfect straight
  // causeway. Underlying floor is absent; these are the real walkable tops.
  const bridge=[[154.7,0.03,0],[164.5,0.03,-1.6],[173.5,0.03,1.9],
    [182,0.03,0.5],[188.3,0.03,3]];
  for(let i=1;i<bridge.length;i++)k.span(bridge[i-1],bridge[i],5.7,.65,'strataRock');
  // Actual three-dimensional, projecting bridge rocks; collision stays on
  // the continuous stone bridge deck, so jagged relief doesn't trip players.
  for(const [x,z,w,h] of [[159.5,-2.6,2.3,.34],[166,2.6,1.6,.27],
    [174,-2.3,2,.4],[181.5,3.8,1.1,.25]]) {
    k.deco([x-w,0.015,z-0.5],[x+w,.015+h,z+0.45],'strataRock');
  }
  for(const offset of [-3.05,3.05]){
    for(let i=1;i<bridge.length;i++){
      const a=bridge[i-1],b=bridge[i];
      k.pipe([a[0],1.15,a[2]+offset],[b[0],1.15,b[2]+offset],.10,'steelGloss');
    }
    for(const [x,y,z] of bridge)k.pillar(x,z+offset,.07,.03,1.15,'steelGloss',12);
  }

  // Distant canyon silhouettes enlarge the scene without filling player
  // routes with identical cubes. No invisible walls or bogus level floor.
  for(const [x,z,r,h] of [
    [-112,-138,21,41],[-121,103,17,36],[-105,266,20,52],
    [-63,317,24,63],[22,324,20,47],[110,309,22,57],
    [281,-142,18,44],[301,-25,21,61],[287,191,17,50],
    [266,291,19,55],[312,320,23,71],
  ])k.crag(x,z,r,h,'strataRock',17);

  // 1. Pressurized freight lock leading out of the hangar. Unlike the
  // command wing this one has inset sliding conduit ribs and a steel grille.
  k.room({x0:60,z0:-7,x1:96,z1:7,ceil:5.8,t:.8,mat:'rivetedSteel',
    skip:['w','e'],strips:'blue',floorMat:'gratedSteel'});
  for(const x of [66,74,83,91]){
    k.pipe([x,4.8,-6.4],[x,4.8,6.4],.2,'steelGloss');
    k.deco([x-.18,.08,-6.4],[x+.18,.17,6.4],'steelGloss');
  }
  k.door('forge_lock',[97,0,-4],[98,4.5,4],false);
  k.lamp([76,4.9,0],'blue');
  k.zone('freight_lock',64,-6,95,6);

  // 2. Working smelter: irregular furnace silhouette, overhead pipe elbows,
  // conveyor belt with rollers, vent stacks and hazardous cut-out plates.
  k.room({x0:99,z0:-22,x1:132,z1:24,ceil:10,t:.9,mat:'rivetedSteel',
    sides:{w:{gaps:[{a:-4,b:4,top:5}]},
      e:{gaps:[{a:-4,b:4,top:5}]}},strips:'red',floorMat:'gratedSteel'});
  k.solid([103,0,13],[111,4,21],'metalDark');
  k.solid([111,0,15],[119,2.1,21],'metal');
  k.deco([105,4,14],[110,4.2,20],'orange');
  k.pipe([105,5.5,19],[126,5.5,19],.33,'steelGloss');
  k.pipe([126,5.5,19],[126,9,19],.34,'steelGloss');
  k.pipe([101,7.5,-15],[128,7.5,-15],.19,'steelGloss');
  for(let x=104;x<127;x+=2.5){
    k.pillar(x,-12.5,.17,.3,1.2,'steelGloss',12);
    k.deco([x,.65,-16],[x+.55,.83,-9.5],'metalDark');
  }
  k.solid([119,.05,-3],[128,.3,9],'gratedSteel');
  k.solid([101,0,-19],[107,1.3,-16],'console');
  k.use('forge_pressure',[104,0,-16],2.5,'Release freight-lock pressure');
  for(const [x,z] of [[103,9],[127,-19],[125,12]]) k.prop('barrel',x,z);
  k.lamp([113,8,18],'orange');
  k.zone('foundry',99,-22,132,24);

  // 3. East terrace: sharply different open-sky rock from the claustrophobic
  // smelter. Stepped ledges and nonuniform fractured spires flank its trail.
  k.zone('ravine_crossing',183,-7,204,13);
  for(const [x,z,r,h] of [[196,-18,3.6,6.5],[210,-21,4.1,8.2],[226,-19,3.7,5.7],
     [201,20,2.3,4.4],[235,18,3.5,9.4],[244,45,5.5,13.2]]) k.crag(x,z,r,h,'strataRock');
  k.solid([198,0,30],[235,.18,33],'gratedSteel');
  k.deco([198,.18,30],[235,.24,30.16],'steelGloss');
  k.deco([198,.18,32.84],[235,.24,33],'steelGloss');
  k.pillar(224,53,3.2,0,17,'rivetedSteel',28);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,x=224+3.7*Math.cos(a),z=53+3.7*Math.sin(a);
    k.pillar(x,z,.09,.1,12,'steelGloss',10);
  }
  k.lamp([224,16,53],'blue');
  k.zone('relay_approach',203,37,241,81);

  // 4. Broadcast relay / archive exchange. Two side annexes are different
  // spaces with different narrative outcomes, not cosmetic buttons.
  k.room({x0:199,z0:86,x1:239,z1:127,ceil:8,t:.8,mat:'rivetedSteel',
    sides:{s:{gaps:[{a:214,b:224,top:6}]},n:{gaps:[{a:211,b:229,top:6}]},
      w:{gaps:[{a:106,b:114,top:4}]},e:{gaps:[{a:105,b:113,top:4}]}},strips:'blue',floorMat:'gratedSteel'});
  k.solid([213,0,91],[226,2.1,95],'console');
  k.deco([215,2.2,94.85],[224,4.2,95],'blue');
  // West rescue annex with real holding-cell bars.
  k.room({x0:171,z0:97,x1:198,z1:121,ceil:5.5,t:.8,mat:'metalDark',
    sides:{e:{gaps:[{a:106,b:114,top:4}]}},strips:'orange',floorMat:'rivetedSteel'});
  k.door('rescue_gate',[197.5,0,106],[199,4,114],true);
  for(const x of [174,177,180,183,186,189,192]){
    k.pillar(x,118,.065,0,4.8,'steelGloss',10);
  }
  k.solid([175,0,102],[181,1.1,105],'console');
  k.use('rescue_prisoners',[179,0,105],2.6,'Free captured civilians');
  k.zone('prison_annex',173,99,196,119);
  // East saboteur annex, separate reactor enclosure with radiation fins.
  k.room({x0:240,z0:94,x1:263,z1:123,ceil:6,t:.75,mat:'rivetedSteel',
    sides:{w:{gaps:[{a:105,b:113,top:4}]}},strips:'red',floorMat:'gratedSteel'});
  k.door('overload_gate',[239,0,105],[241,4,113],true);
  k.pillar(254,111,2.5,0,5.6,'steelGloss',32);
  for(const z of [98,101,116,119])k.deco([248,0.2,z],[259,3.9,z+.35],'hazard');
  k.use('sabotage_relay',[248,0,106],2.5,'Overload the Imperial relay');
  k.zone('reactor_annex',242,95,261,122);

  // 5. Upland ridge: fragmented basalt trail, wind-exposed crates,
  // cut stone guide-posts and an isolated Imperial scanner station.
  k.zone('ridge_climb',195,135,228,158);
  k.solid([204,0,140],[208,.42,154],'strataRock');
  k.solid([211,0,160],[216,.3,172],'strataRock');
  k.crag(194,152,3.7,4.4,'strataRock');
  k.crag(228,174,4.8,7.9,'strataRock');
  k.solid([224,0,164],[232,2.4,172],'metalDark');
  k.deco([225,2.4,166],[231,2.5,170],'blue');
  k.pillar(229,170,.18,2.4,11,'steelGloss',16);
  k.lamp([229,11,170],'red');
  k.crates(218,177,2,1.3);

  // 6. Distinct final extraction pad under the skyline gantry.
  k.zone('upper_pad',195,193,241,227);
  k.solid([197,0,198],[239,.32,220],'rivetedSteel');
  for(const z of [201,217])k.deco([201,.34,z],[235,.41,z+.11],'hazard');
  for(const x of [202,234])k.pillar(x,211,.2,0,13,'steelGloss',20);
  k.pipe([202,13,211],[234,13,211],.25,'steelGloss');
  k.solid([213,0,216],[222,1.6,220],'console');
  k.deco([214,1.6,218.7],[221,2.6,219],'green');
  k.use('evac_beacon',[217,0,214],3,'Signal the extraction shuttle');
  k.lamp([216.5,13,211],'green');
}
