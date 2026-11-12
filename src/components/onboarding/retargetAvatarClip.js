// Re-targets an animation clip from one rig onto another by matching bone
// names after normalising separators, so a Mixamo-style FBX clip can drive a
// glTF body whose joints are named with prefixes.
const normalize = (name) =>
  String(name || '')
    .split(/[|:]/)
    .pop()
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]+/g, '');

export function retargetAvatarClip(sourceRoot, targetRoot, clip) {
  if (!clip) return clip;

  const targetNames = new Map();
  targetRoot?.traverse?.((node) => {
    if (node?.name) targetNames.set(normalize(node.name), node.name);
  });
  if (targetNames.size === 0) return clip;

  const retargeted = clip.clone();
  retargeted.name = clip.name;
  retargeted.tracks.forEach((track) => {
    const dot = track.name.indexOf('.');
    if (dot < 0) return;
    const nodeName = track.name.slice(0, dot);
    const property = track.name.slice(dot);
    const match = targetNames.get(normalize(nodeName));
    if (match) track.name = `${match}${property}`;
  });

  // Keep the clip duration even when a track could not be mapped.
  retargeted.duration = clip.duration;
  return retargeted;
}

export default retargetAvatarClip;