// The caption over a person's head: one camera-facing plane per person, drawn on a
// canvas (white text, dark outline, on a dark rounded panel, so it reads against
// sky, snow, stone or night). Drawn on top of everything, like the game's own
// floating labels. Without a DOM (node tests) it is an invisible stand-in.
import { wrapCaptionText } from './castCaption.mjs';

const FONT_PX = 44;
const LINE_PX = 54;
const PAD_PX = 26;
const NAME_PX = 30;
const METRES_PER_PX = 0.0034;

const roundRect = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

export function createCaptionView(THREE, { geometry }) {
  const doc = globalThis.document;
  const material = new THREE.MeshBasicMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ThreeRoadsCastCaption';
  mesh.renderOrder = 1000;
  mesh.visible = false;
  mesh.userData.threeRoadsCast = true;
  let texture = null;
  let aspect = 1, heightMetres = 0.3;

  function setText(text, speaker = '', { maxChars, maxLines } = {}) {
    if (!doc?.createElement) return;
    const lines = wrapCaptionText(text, maxChars, maxLines);
    const canvas = doc.createElement('canvas');
    const g = canvas.getContext('2d');
    if (!g) return;
    const font = `600 ${FONT_PX}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const nameFont = `700 ${NAME_PX}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.font = font;
    let width = 0;
    for (const line of lines) width = Math.max(width, g.measureText(line).width);
    if (speaker) { g.font = nameFont; width = Math.max(width, g.measureText(speaker).width); }
    const nameHeight = speaker ? NAME_PX + 10 : 0;
    canvas.width = Math.ceil(width + PAD_PX * 2);
    canvas.height = Math.ceil(nameHeight + lines.length * LINE_PX + PAD_PX * 1.6);
    g.fillStyle = 'rgba(10, 12, 18, 0.8)';
    roundRect(g, 2, 2, canvas.width - 4, canvas.height - 4, 18);
    g.fill();
    g.strokeStyle = 'rgba(232, 214, 160, 0.55)';
    g.lineWidth = 3;
    g.stroke();
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    let y = PAD_PX * 0.8;
    if (speaker) {
      g.font = nameFont;
      g.fillStyle = '#e8d6a0';
      g.fillText(speaker, PAD_PX, y);
      y += nameHeight;
    }
    g.font = font;
    for (const line of lines) {
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      g.strokeText(line, PAD_PX, y);
      g.fillStyle = '#ffffff';
      g.fillText(line, PAD_PX, y);
      y += LINE_PX;
    }
    texture?.dispose();
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    material.map = texture;
    material.needsUpdate = true;
    aspect = canvas.width / canvas.height;
    heightMetres = canvas.height * METRES_PER_PX;
  }

  return {
    mesh,
    setText,
    /** Places the caption at (x, y, z) facing the camera, `grow` >= 1 keeps far text readable. */
    place(x, y, z, camera, opacity, grow = 1) {
      const show = opacity > 0.01 && Boolean(material.map);
      mesh.visible = show;
      if (!show) return;
      material.opacity = opacity;
      const h = heightMetres * grow;
      mesh.scale.set(h * aspect, h, 1);
      mesh.position.set(x, y + h / 2, z);
      if (camera) mesh.quaternion.copy(camera.quaternion);
    },
    /** The caption's height in metres at grow 1 (for sizing it on screen). */
    get height() { return heightMetres; },
    hide() { mesh.visible = false; },
    dispose() {
      mesh.removeFromParent();
      texture?.dispose();
      texture = null;
      material.dispose();
    },
  };
}
