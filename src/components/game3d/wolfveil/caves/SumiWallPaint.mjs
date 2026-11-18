// The owner's sumi-e brick wall, painted instead of built.
//
// In the owner's corridor file every brick, every gold joint and every silver
// seam of a wall is its own solid shape: a 24 m hallway is 185,000 triangles
// and the sanctuary's four great walls are 5.7 million. Here the same wall is
// one flat panel carrying a picture of it: the same wandering courses (the
// owner's own seam curve), the same running bond, the same gold and silver
// inlay. Pure numbers: no canvas, no renderer.

/** The course pattern repeats along a wall every 11.42 m. */
export const SUMI_WALL_PERIOD=Math.PI*2/.55;
/** The four brick tones of the owner's file (as the eye sees them, 0..255). */
export const SUMI_BRICK_TONES=Object.freeze([[132,96,62],[115,82,54],[146,108,70],[98,72,48]]);
const GOLD=[[200,146,38],[246,207,101],[158,107,20]],SILVER=[[154,163,173],[238,242,246],[108,117,125]];
const JOINT_HALF=.026,SEAM_HALF=.024;

/**
 * Height of the seam under course `row` at distance `s` along the wall: the
 * owner's getHallwaySeamY, number for number (a test holds the two together).
 */
export function sumiWallSeamY(s,row,rows=9,wallHeight=3.9,baseOffset=.16){
  const rowHeight=(wallHeight-.45)/rows;
  if(row<=0)return baseOffset;
  if(row>=rows)return wallHeight-.32;
  const base=baseOffset+row*rowHeight;
  const phase=s*.55+row*1.15,cycle=((phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  let offset;
  if(cycle<1.6)offset=cycle/1.6*.13;
  else if(cycle<3.1)offset=.13;
  else if(cycle<4.5)offset=.13*(1-(cycle-3.1)/1.4);
  else offset=Math.sin((cycle-4.5)*3.5)*.09;
  return base+offset;
}

const seeded=seed=>{let s=seed%2147483647;if(s<=0)s+=2147483646;return ()=>(s=s*16807%2147483647)/2147483647;};
const hash=(a,b)=>{const s=Math.sin(a*127.1+b*311.7+.7)*43758.5453;return s-Math.floor(s);};
// Soft blotches, like the mottled sandstone of the owner's bricks.
function mottle(x,y){
  const cell=(u,v)=>{const iu=Math.floor(u),iv=Math.floor(v),fu=u-iu,fv=v-iv,su=fu*fu*(3-2*fu),sv=fv*fv*(3-2*fv);
    const a=hash(iu,iv),b=hash(iu+1,iv),c=hash(iu,iv+1),d=hash(iu+1,iv+1);
    return a+(b-a)*su+(c-a)*sv+(a-b-c+d)*su*sv;};
  return cell(x*5,y*5)*.6+cell(x*17,y*17)*.4;
}

/**
 * The running bond of one wall picture: for every course, where its upright
 * joints fall (metres along the wall, within one period) and the tone of each
 * brick. Lengths are the owner's (1.15 to 1.5 m), closed up so the picture
 * repeats without a seam.
 */
export function planSumiWallBond({rows=9,seed=909}={}){
  const random=seeded(seed),courses=[];
  for(let row=0;row<rows;row++){
    const lengths=[];
    let total=0;
    while(total<SUMI_WALL_PERIOD-.7){const length=1.15+random()*.35;lengths.push(length);total+=length;}
    // Stretch or squeeze the course a few per cent so it closes on itself.
    const fit=SUMI_WALL_PERIOD/total,joints=[];
    let s=(row%2)*.65;
    for(const length of lengths){joints.push(s%SUMI_WALL_PERIOD);s+=length*fit;}
    joints.sort((a,b)=>a-b);
    courses.push({joints,tones:joints.map((_,i)=>(row+Math.floor(random()*4)+i)%4),
      silver:joints.map(joint=>(row+Math.round(joint))%3===0)});
  }
  return courses;
}

/**
 * Paint one period of wall: `width` x `height` pixels covering
 * SUMI_WALL_PERIOD metres by `wallHeight` metres, bottom row first.
 * @returns {{data:Uint8ClampedArray,width:number,height:number}} RGBA
 */
export function paintSumiWall({width=1024,height=512,rows=9,wallHeight=3.9,seed=909}={}){
  const data=new Uint8ClampedArray(width*height*4),bond=planSumiWallBond({rows,seed});
  const seams=new Float32Array(rows+1);
  const metal=(stops,t,grain)=>{
    const u=Math.max(0,Math.min(1,t))*2,i=Math.min(1,Math.floor(u)),f=u-i;
    return [0,1,2].map(n=>(stops[i][n]+(stops[i+1][n]-stops[i][n])*f)*grain);
  };
  for(let px=0;px<width;px++){
    const s=(px+.5)/width*SUMI_WALL_PERIOD;
    for(let row=0;row<=rows;row++)seams[row]=sumiWallSeamY(s,row,rows,wallHeight);
    let row=0;
    for(let py=0;py<height;py++){
      const y=(py+.5)/height*wallHeight,at=(py*width+px)*4;
      while(row<rows&&y>=seams[row+1])row++;
      let colour;
      if(y<seams[0]){
        // The footing under the first course.
        const tone=SUMI_BRICK_TONES[3],k=.72+.18*mottle(s,y);
        colour=[tone[0]*k,tone[1]*k,tone[2]*k];
      }else if(row>=rows){
        // Behind the crown moulding.
        const tone=SUMI_BRICK_TONES[1],k=.8+.2*mottle(s,y);
        colour=[tone[0]*k,tone[1]*k,tone[2]*k];
      }else{
        const below=y-seams[row],above=seams[row+1]-y,course=bond[row];
        // Which brick: the last joint at or before s (the pattern wraps).
        let brick=course.joints.length-1;
        for(let i=0;i<course.joints.length;i++)if(course.joints[i]<=s)brick=i;
        const jointAt=course.joints[brick],next=course.joints[(brick+1)%course.joints.length];
        const fromJoint=((s-jointAt)%SUMI_WALL_PERIOD+SUMI_WALL_PERIOD)%SUMI_WALL_PERIOD;
        const toNext=((next-s)%SUMI_WALL_PERIOD+SUMI_WALL_PERIOD)%SUMI_WALL_PERIOD;
        const grain=.86+.22*hash(Math.floor(s*40),Math.floor(y*9));
        if(row>0&&below<SEAM_HALF)colour=metal(row%3===1?SILVER:GOLD,.5+below/SEAM_HALF*.5,grain);
        else if(row+1<rows&&above<SEAM_HALF)colour=metal((row+1)%3===1?SILVER:GOLD,.5-above/SEAM_HALF*.5,grain);
        else if(fromJoint<JOINT_HALF)colour=metal(course.silver[brick]?SILVER:GOLD,.5+fromJoint/JOINT_HALF*.5,grain);
        else if(toNext<JOINT_HALF)
          colour=metal(course.silver[(brick+1)%course.joints.length]?SILVER:GOLD,.5-toNext/JOINT_HALF*.5,grain);
        else{
          const tone=SUMI_BRICK_TONES[course.tones[brick]];
          // Each brick stands a little proud: light on its top edge, shadow
          // under it and beside the inlay.
          let k=.8+.3*mottle(s+brick*3.1,y+row*1.7)+(hash(brick+row*13,seed)-.5)*.1;
          const edge=Math.min(below,above,fromJoint,toNext);
          if(above<.05)k*=1+.16*(1-above/.05);
          if(below<.06)k*=1-.26*(1-below/.06);
          if(edge<.035)k*=.86+.14*edge/.035;
          colour=[tone[0]*k,tone[1]*k,tone[2]*k];
        }
      }
      data[at]=colour[0];data[at+1]=colour[1];data[at+2]=colour[2];data[at+3]=255;
    }
  }
  return {data,width,height};
}

/** A picture big enough for a wall of this height (taller walls, taller pictures). */
export function sumiWallPictureSize(wallHeight){
  if(wallHeight<=4.5)return {width:1024,height:512};
  if(wallHeight<=9)return {width:1024,height:1024};
  return {width:512,height:2048};
}

/**
 * The flat pieces of one wall, in the wall's own measure (s along it, y up):
 * a full-height panel for every stretch between doorways, and a panel over
 * every doorway lower than the wall.
 * @param openings [{min,max,maxY}] doorways kept clear, as in the owner's file
 * @returns {Array<{s0,s1,y0,y1}>}
 */
export function sumiWallPanels({spanMin=-12,spanMax=12,wallHeight=3.9,openings=[]}={}){
  let stretches=[[spanMin,spanMax]];
  for(const opening of openings){
    const next=[];
    for(const [from,to] of stretches){
      if(to<=opening.min||from>=opening.max){next.push([from,to]);continue;}
      if(from<opening.min)next.push([from,opening.min]);
      if(to>opening.max)next.push([opening.max,to]);
    }
    stretches=next;
  }
  const panels=stretches.filter(([from,to])=>to-from>.05).map(([from,to])=>({s0:from,s1:to,y0:0,y1:wallHeight}));
  for(const opening of openings){
    const from=Math.max(spanMin,opening.min),to=Math.min(spanMax,opening.max);
    if(opening.maxY&&opening.maxY<wallHeight-.35&&to-from>.05)panels.push({s0:from,s1:to,y0:opening.maxY,y1:wallHeight});
  }
  return panels;
}
