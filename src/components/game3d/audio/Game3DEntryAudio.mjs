// Single Game 3D title/world soundtrack with a quiet, independent outdoor bed.
// Character login: ONLY the user's theme (no outdoor nature sounds).
// World: the SAME theme continues at its exact position and loops, while the
// soft wind/birds nature bed sits underneath. Combat owns the theme's music
// transport, and ambience immediately pauses while fighting.
export const GAME3D_LOGIN_THEME_URL=
  'https://media.base44.com/files/public/6876751a602125f45f1861b9/547573d26_character_login_theme.mp3';
export const GAME3D_NATURE_AMBIENCE_URL=
  'https://media.base44.com/files/public/6876751a602125f45f1861b9/75e442706_wolfveil_light_wind_birds.mp3';

// Gentle ambience rather than an audible wind track dominating the melody.
// Source contains both wind and occasional bird calls; volume is intentionally
// much lower than music (and lower than the previous .42 multiplier).
export const GAME3D_AMBIENCE_GAIN=.075;
export const GAME3D_WORLD_THEME_GAIN=.65;
export const game3DOutdoorRegion=region=>region==='wolfveil'||region==='forest';
const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const ease=t=>t*t*(3-2*t);

// One title/world soundtrack at a time. The character login and the world
// share a single element; if another host mounts (a re-entry, a second game
// instance, a remount race) it takes the transport over instead of starting a
// duplicate copy of the same track on top of the one already playing.
let liveTransport=null;

// The title/world theme is ONE pair of media elements for the whole app, so a
// re-entry can never start a second copy of the same track beside one that is
// already playing.
let sharedMedia=null;

function releaseSharedMedia(){
  if(!sharedMedia)return;
  for(const audio of [sharedMedia.intro,sharedMedia.nature]){
    try{audio.pause();audio.removeAttribute?.('src');audio.load?.();}catch{}
  }
  sharedMedia=null;
}

function acquireSharedMedia(themeUrl,natureUrl,createAudio){
  if(sharedMedia&&sharedMedia.themeUrl===themeUrl&&sharedMedia.natureUrl===natureUrl)
    return sharedMedia;
  releaseSharedMedia();
  const intro=createAudio(themeUrl),nature=createAudio(natureUrl);
  intro.loop=false;
  nature.loop=true;
  intro.preload='auto';nature.preload='auto';
  intro.volume=0;nature.volume=0;
  sharedMedia={themeUrl,natureUrl,intro,nature};
  return sharedMedia;
}

export function createGame3DEntryAudio({
  themeUrl=GAME3D_LOGIN_THEME_URL,
  natureUrl=GAME3D_NATURE_AMBIENCE_URL,
  createAudio=url=>new Audio(url),
  clock=()=>performance.now(),
  setTick=(callback,ms)=>setInterval(callback,ms),
  clearTick=id=>clearInterval(id),
  inCombat=()=>false,
  initialVolume=.5,
  initialRegion='wolfveil',
}={}){
  // A previous transport must go silent before this one starts.
  try{liveTransport?.dispose();}catch{}
  // Reuse the one shared pair: a re-entry inherits the same element instead of
  // layering a second copy of the track over the first.
  const {intro,nature}=acquireSharedMedia(themeUrl,natureUrl,createAudio);
  let volume=clamp(initialVolume),phase='login',region=initialRegion;
  let introFinished=false,disposed=false,timer=null,heartbeat=null,transition=0;
  let natureWasSuppressed=false;

  function clearFade(){
    if(timer!==null){clearTick(timer);timer=null;}
    transition++;
  }
  function pause(audio){
    try{audio.pause();}catch{}
  }
  function play(audio){
    if(disposed||!audio?.paused)return;
    try{const result=audio.play();result?.catch?.(()=>{});}catch{}
  }
  function targets(){
    return {
      intro:volume*(phase==='login'?1:GAME3D_WORLD_THEME_GAIN),
      nature:phase==='world'&&game3DOutdoorRegion(region)&&!inCombat()
        ?volume*GAME3D_AMBIENCE_GAIN:0,
    };
  }
  function stopNatureImmediately(){
    nature.volume=0;
    pause(nature);
    natureWasSuppressed=true;
  }
  function fade({duration=850,introChannel=true,natureChannel=true}={}){
    if(disposed)return;
    clearFade();
    const target=targets();
    const musicOwnedByCombat=phase==='world'&&inCombat();
    if(musicOwnedByCombat)introChannel=false;
    if(introChannel&&target.intro>0&&!introFinished)play(intro);
    if(natureChannel&&target.nature>0)play(nature);
    const fromMusic=intro.volume,fromNature=nature.volume,started=clock(),token=transition;
    const tick=()=>{
      if(disposed||token!==transition)return;
      if(phase==='world'&&inCombat()){
        // CombatMusicController owns music fading and resuming.
        // Only silence the independent wind/birds bed right away.
        stopNatureImmediately();
        clearFade();
        return;
      }
      const t=duration?ease(clamp((clock()-started)/duration)):1;
      if(introChannel)intro.volume=clamp(fromMusic+(target.intro-fromMusic)*t);
      if(natureChannel)nature.volume=clamp(fromNature+(target.nature-fromNature)*t);
      if(t>=1){
        clearFade();
        if(natureChannel&&target.nature===0)pause(nature);
      }
    };
    if(duration<=0){tick();return;}
    timer=setTick(tick,40);
  }
  function observeCombat(){
    if(disposed||phase!=='world')return;
    if(inCombat()){
      if(!nature.paused||nature.volume>0)stopNatureImmediately();
    }else if(natureWasSuppressed&&game3DOutdoorRegion(region)){
      natureWasSuppressed=false;
      fade({duration:1000,introChannel:false});
    }
  }
  const onIntroEnded=()=>{
    if(disposed)return;
    introFinished=true;
    // No wind/bird sounds on character-select even if the song ends.
    // Game 3D world loops this same soundtrack, not an ambient replacement.
  };
  intro.addEventListener?.('ended',onIntroEnded);

  function start(){
    if(disposed)return;
    fade({duration:900});
    heartbeat=setTick(observeCombat,200);
  }
  function setPhase(next){
    if(disposed||!['login','world'].includes(next)||phase===next)return;
    phase=next;
    if(phase==='login'){
      intro.loop=false;
      introFinished=false;
      stopNatureImmediately();  // never bleed outdoor sound into the menu
      try{intro.currentTime=0;}catch{}
      fade({duration:850,natureChannel:false});
    }else{
      intro.loop=true;
      natureWasSuppressed=false;
      // Continue the same track from where it is. Only a finished (and thus
      // silent) title restarts, so entry never plays a second copy alongside
      // the one already running behind the character menu.
      if(introFinished&&intro.paused){
        introFinished=false;
        try{intro.currentTime=0;}catch{}
      }
      // Continue the same title track while entering the world; do not
      // recreate the element or seek to the beginning if it was playing.
      fade({duration:1900});
    }
  }
  function setRegion(next){
    if(disposed||next===region)return;
    region=next;
    if(phase!=='world')return;
    if(!game3DOutdoorRegion(region))stopNatureImmediately();
    else {natureWasSuppressed=false;fade({duration:900,introChannel:false});}
  }
  function setVolume(next){
    if(disposed)return;
    const v=clamp(next);
    if(volume===v)return;
    volume=v;
    if(phase==='world'&&inCombat()){
      // Caller updates combatMusicController's desired world-volume separately.
      stopNatureImmediately();
      return;
    }
    fade({duration:200});
  }
  function unlock(){
    if(disposed)return;
    if(targets().intro>0&&!introFinished&&!(phase==='world'&&inCombat()))play(intro);
    if(targets().nature>0)play(nature);
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    const owner=liveTransport===api;
    if(owner)liveTransport=null;
    clearFade();
    if(heartbeat!==null)clearTick(heartbeat);
    intro.removeEventListener?.('ended',onIntroEnded);
    // A stale transport must never silence the track a newer one now owns.
    if(!owner)return;
    stopNatureImmediately();
    releaseSharedMedia();
  }
  const api = {
    start,setPhase,setRegion,setVolume,unlock,dispose,    getWorldAudio:()=>intro,
    getNatureAudio:()=>nature,
    getStatus:()=>({phase,region,introFinished,volume,disposed,
      titlePlaying:!intro.paused,naturePlaying:!nature.paused}),
  };
  liveTransport=api;
  return api;
}