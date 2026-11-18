// Many small meshes of one material become one list of triangles, so a whole
// piece of the owner's cave kit is drawn in a handful of draw calls instead
// of thousands. Pure numbers; the renderer side lives in SumiCaveLightKit.js.

// Rows of the 3x3 that carries normals for a 4x4 (column-major) transform:
// the cofactors, which stay right under uneven scale and mirroring.
function normalRows(m){
  const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];
  const rows=[e*i-f*h,f*g-d*i,d*h-e*g, c*h-b*i,a*i-c*g,b*g-a*h, b*f-c*e,c*d-a*f,a*e-b*d];
  const determinant=a*rows[0]+b*rows[1]+c*rows[2];
  return {rows,determinant};
}

/**
 * @param sources [{position, normal?, uv?, index?, matrix?}] where position,
 *   normal and uv are flat number lists (3, 3 and 2 per corner), index lists
 *   corners three to a triangle, and matrix is 16 numbers, column-major.
 * @returns {{position:Float32Array,normal:Float32Array,uv:Float32Array,triangles:number}}
 *   three corners per triangle, nothing shared.
 */
export function mergeSumiTriangles(sources){
  let corners=0;
  for(const source of sources)corners+=source.index?source.index.length:source.position.length/3;
  corners-=corners%3;
  const position=new Float32Array(corners*3),normal=new Float32Array(corners*3),uv=new Float32Array(corners*2);
  let at=0;
  for(const source of sources){
    const m=source.matrix,count=source.index?source.index.length:source.position.length/3;
    const {rows,determinant}=m?normalRows(m):{rows:[1,0,0,0,1,0,0,0,1],determinant:1};
    const mirrored=determinant<0;
    for(let t=0;t+2<count;t+=3){
      // A mirrored piece is seen from its other face: turn each triangle over.
      const order=mirrored?[t,t+2,t+1]:[t,t+1,t+2];
      const start=at;
      for(const k of order){
        const i=source.index?source.index[k]:k;
        const x=source.position[i*3],y=source.position[i*3+1],z=source.position[i*3+2];
        position[at*3]=m?m[0]*x+m[4]*y+m[8]*z+m[12]:x;
        position[at*3+1]=m?m[1]*x+m[5]*y+m[9]*z+m[13]:y;
        position[at*3+2]=m?m[2]*x+m[6]*y+m[10]*z+m[14]:z;
        if(source.normal){
          const nx=source.normal[i*3],ny=source.normal[i*3+1],nz=source.normal[i*3+2];
          let ox=rows[0]*nx+rows[1]*ny+rows[2]*nz,oy=rows[3]*nx+rows[4]*ny+rows[5]*nz,oz=rows[6]*nx+rows[7]*ny+rows[8]*nz;
          const length=Math.hypot(ox,oy,oz)*(mirrored?-1:1)||1;
          normal[at*3]=ox/length;normal[at*3+1]=oy/length;normal[at*3+2]=oz/length;
        }
        if(source.uv){uv[at*2]=source.uv[i*2];uv[at*2+1]=source.uv[i*2+1];}
        at++;
      }
      if(!source.normal){
        // No normals given: every triangle faces the way it is wound.
        const p=position,a=start*3,b=a+3,c=a+6;
        const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz)||1;
        for(let k=0;k<3;k++){normal[(start+k)*3]=nx/length;normal[(start+k)*3+1]=ny/length;normal[(start+k)*3+2]=nz/length;}
      }
    }
  }
  return {position,normal,uv,triangles:corners/3};
}

/** The box that holds a merged list: {min:[x,y,z],max:[x,y,z]}. */
export function sumiTriangleBounds(position){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<position.length;i+=3)for(let k=0;k<3;k++){
    if(position[i+k]<min[k])min[k]=position[i+k];
    if(position[i+k]>max[k])max[k]=position[i+k];
  }
  return {min,max};
}
