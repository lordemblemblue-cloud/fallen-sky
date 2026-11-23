/**
 * Alpha-connected regions of a parts sheet. Pure: works on a raw RGBA buffer, no image library.
 *
 * Parts are separated by transparency, never by colour: the archer's outfit is white, so a white colour key would
 * eat it. A pixel belongs to a part when its alpha is at least `alphaMin`; two part pixels are connected when they
 * touch, diagonals included (8-connectivity).
 */

/**
 * Label the alpha-connected regions of an RGBA image.
 * @param {Uint8Array|Buffer} rgba  width*height*4 bytes
 * @param {number} width
 * @param {number} height
 * @param {{alphaMin?:number}} [o]
 * @returns {{labels: Int32Array, components: Array<{id:number, area:number, x0:number, y0:number, x1:number, y1:number, cx:number, cy:number}>}}
 *   labels holds the component id + 1 of every pixel (0 = transparent); boxes are inclusive pixel bounds.
 */
export function labelAlphaComponents(rgba, width, height, { alphaMin = 16 } = {}) {
  const labels = new Int32Array(width * height);
  const components = [];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== 0 || rgba[start * 4 + 3] < alphaMin) continue;
    const id = components.length;
    const comp = { id, area: 0, x0: width, y0: height, x1: -1, y1: -1, cx: 0, cy: 0 };
    let top = 0;
    stack[top++] = start;
    labels[start] = id + 1;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      comp.area += 1;
      comp.cx += x;
      comp.cy += y;
      if (x < comp.x0) comp.x0 = x;
      if (x > comp.x1) comp.x1 = x;
      if (y < comp.y0) comp.y0 = y;
      if (y > comp.y1) comp.y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (labels[q] !== 0 || rgba[q * 4 + 3] < alphaMin) continue;
          labels[q] = id + 1;
          stack[top++] = q;
        }
      }
    }
    comp.cx /= comp.area;
    comp.cy /= comp.area;
    components.push(comp);
  }
  return { labels, components };
}

/** True when box a overlaps box b grown by `margin` pixels on every side. */
export function boxesTouch(a, b, margin = 0) {
  return a.x0 <= b.x1 + margin && a.x1 >= b.x0 - margin && a.y0 <= b.y1 + margin && a.y1 >= b.y0 - margin;
}

/**
 * Which component ids make up a part: every component whose centre lies inside the part's rectangle and that is at
 * least `minArea` pixels (specks outside every part are dropped). Rectangles are [x0, y0, x1, y1], inclusive.
 */
export function componentsInRect(components, rect, { minArea = 1 } = {}) {
  const [x0, y0, x1, y1] = rect;
  return components
    .filter((c) => c.area >= minArea && c.cx >= x0 && c.cx <= x1 && c.cy >= y0 && c.cy <= y1)
    .map((c) => c.id);
}

/**
 * Copy the pixels of the given components into a new RGBA buffer cropped to their joint bounds plus `pad`.
 * Pixels of other components inside that box stay transparent, so neighbours never leak into a layer.
 * @returns {{rgba: Uint8Array, width:number, height:number, x0:number, y0:number}} x0/y0 = sheet position of the crop
 */
export function extractComponents(rgba, width, height, labels, ids, components, { pad = 2 } = {}) {
  const wanted = new Set(ids.map((id) => id + 1));
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (const id of ids) {
    const c = components[id];
    x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1);
  }
  if (x1 < 0) return null;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = y + y0;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < w; x += 1) {
      const sx = x + x0;
      if (sx < 0 || sx >= width) continue;
      const si = sy * width + sx;
      if (!wanted.has(labels[si])) {
        // keep the soft anti-aliased fringe (alpha below the threshold) next to a wanted pixel
        if (labels[si] !== 0 || rgba[si * 4 + 3] === 0 || !touchesWanted(labels, width, height, sx, sy, wanted)) continue;
      }
      const di = (y * w + x) * 4;
      out[di] = rgba[si * 4]; out[di + 1] = rgba[si * 4 + 1]; out[di + 2] = rgba[si * 4 + 2]; out[di + 3] = rgba[si * 4 + 3];
    }
  }
  return { rgba: out, width: w, height: h, x0, y0 };
}

function touchesWanted(labels, width, height, x, y, wanted) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (wanted.has(labels[ny * width + nx])) return true;
    }
  }
  return false;
}
