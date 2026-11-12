/** Shared metre-based cell addressing for the Luna estate and Game 3D.
 * X/Z are horizontal world coordinates; Y is elevation, NOT geodetic latitude.
 * Indices are stable across camera zoom, world meshes and player motion.
 */
export function createTileGrid(bounds, size = 5) {
  const { minX, maxX, minZ, maxZ } = bounds;
  if (![minX,maxX,minZ,maxZ,size].every(Number.isFinite) ||
      maxX <= minX || maxZ <= minZ || size <= 0) throw new Error('Invalid tile grid');
  return { minX,maxX,minZ,maxZ,size,
    columns: Math.ceil((maxX-minX)/size),
    rows: Math.ceil((maxZ-minZ)/size) };
}

export function tileAt(grid, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) ||
      x < grid.minX || x >= grid.maxX || z < grid.minZ || z >= grid.maxZ) return null;
  const column = Math.floor((x-grid.minX)/grid.size);
  const row = Math.floor((z-grid.minZ)/grid.size);
  return { column,row,id:`X${column}-Z${row}` };
}

export function tileFromId(grid, id) {
  const match=/^X(\d+)-Z(\d+)$/.exec(id || '');
  if(!match)return null;
  const column=Number(match[1]),row=Number(match[2]);
  if(column >= grid.columns || row >= grid.rows)return null;
  const minX=grid.minX+column*grid.size, minZ=grid.minZ+row*grid.size;
  const maxX=Math.min(grid.maxX,minX+grid.size), maxZ=Math.min(grid.maxZ,minZ+grid.size);
  return { id,column,row,minX,maxX,minZ,maxZ,
    centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2,
    width:maxX-minX,depth:maxZ-minZ };
}

export function rectangleTiles(grid, from, to, limit = 10000) {
  if(!from || !to)return [];
  const minColumn=Math.min(from.column,to.column),maxColumn=Math.max(from.column,to.column);
  const minRow=Math.min(from.row,to.row),maxRow=Math.max(from.row,to.row);
  const result=[];
  for(let row=minRow;row<=maxRow;row++) for(let column=minColumn;column<=maxColumn;column++){
    if(result.length>=limit)return result;
    result.push(`X${column}-Z${row}`);
  }
  return result;
}

export function mergeTileIds(grid, current, added, additive = false) {
  const ids=additive ? [...current,...added] : [...added];
  return [...new Set(ids)].filter(id=>!!tileFromId(grid,id))
    .sort((a,b)=>{const x=tileFromId(grid,a),y=tileFromId(grid,b);return x.row-y.row||x.column-y.column;});
}

export function csvCell(value) {
  const text=String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
}
