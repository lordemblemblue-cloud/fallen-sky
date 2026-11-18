// Owner-uploaded original Raven RBSP v1 single-player campaign maps.
// These are story/mission BSPs, NOT multiplayer arenas: they generally contain
// info_player_start but no info_player_deathmatch entities.
// Archive Mode renders their real surface geometry and uses BSP collisions;
// ICARUS scripts, textures, cutscenes and objectives require additional assets.
const ROWS = [
  ['t1_sour','T1 · Sour','t1_sour(1).bsp',10203160],
  ['t1_surprise','T1 · Surprise','t1_surprise.bsp',10551572],
  ['t2_dpred','T2 · Dpred','t2_dpred.bsp',12371844],
  ['t2_rancor','T2 · Rancor','t2_rancor.bsp',16977060],
  ['t2_rogue','T2 · Rogue','t2_rogue.bsp',12342268],
  ['t2_trip','T2 · Trip','t2_trip.bsp',14157324],
  ['t2_wedge','T2 · Wedge','t2_wedge.bsp',13861188,'t2_wedge.weather'],
  ['t3_bounty','T3 · Bounty','t3_bounty.bsp',15817700],
  ['t3_byss','T3 · Byss','t3_byss.bsp',10690544],
  ['t3_hevil','T3 · Hevil','t3_hevil.bsp',10431564],
  ['t3_rift','T3 · Rift','t3_rift.bsp',13029872],
  // The owner supplied t3_stamp(1).bsp (same bytes as t3_stamp).
  ['t3_stamp','T3 · Stamp','t3_stamp.bsp',12754764,null,null,'t3_stamp(1).bsp'],
  // Additional original Jedi Academy BSPs uploaded October 19, 2026.
  ['yavin1','Yavin · First Area','yavin1.bsp',8153500],
  ['yavin1b','Yavin · Second Area','yavin1b.bsp',10959860],
  ['yavin2','Yavin · Third Area','yavin2.bsp',14463500,'yavin2.weather',26661],
  ['vjun1','Vjun · First Area','vjun1.bsp',14290148,'vjun1.weather',321293],
  ['vjun2','Vjun · Second Area','vjun2.bsp',13339312],
  ['vjun3','Vjun · Third Area','vjun3.bsp',13711492],
  ['taspir1','Taspir · First Area','taspir1.bsp',15512472],
  ['taspir2','Taspir · Second Area','taspir2.bsp',18006316],
  // Added from the owner's October 19 Academy/Hoth/Korriban mission BSP upload.
  ['academy1','Academy · 1','academy1.bsp',1770292],
  ['academy2','Academy · 2','academy2.bsp',1606072],
  ['academy3','Academy · 3','academy3.bsp',1601976],
  ['academy4','Academy · 4','academy4.bsp',1687236],
  ['academy5','Academy · 5','academy5.bsp',1601176],
  ['academy6','Academy · 6','academy6.bsp',4098704],
  ['hoth2','Hoth · 2','hoth2.bsp',13970616,'hoth2.weather',301798],
  ['hoth3','Hoth · 3','hoth3.bsp',13920700],
  ['kor1','Korriban · 1','kor1.bsp',12565400],
  ['kor2','Korriban · 2','kor2.bsp',11963536],
  ['t1_danger','T1 · Danger','t1_danger.bsp',10833924],
  ['t1_fatal','T1 · Fatal','t1_fatal.bsp',13503020],
  ['t1_inter','T1 · Inter','t1_inter.bsp',730168],
  ['t1_rail','T1 · Rail','t1_rail.bsp',14293596,'t1_rail.weather',44086],
  // Keep t1_sour(1).bsp in the existing archive intact; this is another
  // supplied filename, not silently aliased over a prior installed version.
  ['t1_sour_uploaded','T1 · Sour (Oct 19)','t1_sour.bsp',10203160],
];
export const GAME2_MISSION_ARCHIVE = Object.freeze(Object.fromEntries(ROWS.map(([id,label,filename,bytes,weather,weatherBytes,sourceAlias])=>
  [id,Object.freeze({id,label,filename,bytes,weather:weather||null,weatherBytes:weatherBytes||null,sourceAlias:sourceAlias||null,mode:'archive',chapter:id.split('_')[0].toUpperCase()})])));
export const GAME2_ARCHIVE_COUNT = ROWS.length;
// The separate T1 Rail weather file has no matching BSP in this upload.
// Keep it as a companion asset; NEVER attach it to the unrelated Sour map.
export const GAME2_ARCHIVE_WEATHER = Object.freeze([
  {filename:'t1_rail(1).weather',bytes:44086,mapId:null},
  {filename:'t2_wedge.weather',bytes:58763,mapId:'t2_wedge'},
]);
export const archiveByFileName = filename => {
  const lower=String(filename||'').toLowerCase().replace(/\\/g,'/').split('/').pop();
  // Exact filename match; do not guess that an unrelated BSP is this mission.
  return Object.values(GAME2_MISSION_ARCHIVE).find(m=>m.filename.toLowerCase()===lower || m.sourceAlias?.toLowerCase()===lower || m.weather?.toLowerCase()===lower) ||
    GAME2_ARCHIVE_WEATHER.find(m=>m.filename.toLowerCase()===lower) || null;
};
