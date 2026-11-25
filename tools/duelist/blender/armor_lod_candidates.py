"""Offline candidate builder (Blender 4.x), not a runtime decimator.
Run from repository root:
  blender -b -t 2 --python tools/duelist/blender/armor_lod_candidates.py -- --output /tmp/duelist-lod
Produces LOW candidates only. Hidden outfits need intentionally authored base clothing;
never strip a fused body by name or delete arbitrary faces.
"""
import argparse
import json
import sys
from pathlib import Path
import bpy

SOURCES = {
    "huntress": "public/models/characters/duelist/huntress.glb",
    "maskedWarrior": "public/models/characters/duelist/masked-warrior.glb",
    "female": "public/models/characters/fused/Female_Fused_v2.glb",
    "male": "public/models/characters/fused/Male_Fused_v2.glb",
}

def counts():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for obj in meshes:
        obj.data.calc_loop_triangles()
    return sum(len(o.data.loop_triangles) for o in meshes)

def bones():
    return sorted({b.name for o in bpy.context.scene.objects if o.type == "ARMATURE" for b in o.data.bones})

def build(source, destination, ratio):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    before, original_bones = counts(), bones()
    if not original_bones or before < 1:
        raise RuntimeError(f"Missing skinned source: {source}")
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or len(obj.data.polygons) < 50 or obj.data.shape_keys:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("Offline LOD candidate", "DECIMATE")
        mod.ratio = ratio
        # Apply the decimator only, not the armature modifier.
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for image in bpy.data.images:
        if image.size[0] > 512 or image.size[1] > 512:
            scale = 512 / max(image.size)
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    after = counts()
    if after >= before:
        raise RuntimeError(f"LOD did not reduce triangles: {source}")
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", export_skins=True,
                             export_animations=True, export_apply=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(destination))
    if bones() != original_bones or counts() != after:
        raise RuntimeError(f"Round-trip rig or geometry mismatch: {destination}")
    if not any(o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)
               for o in bpy.context.scene.objects):
        raise RuntimeError(f"Skin binding lost: {destination}")
    return {"triangles_before": before, "triangles_after": after,
            "bytes_before": source.stat().st_size, "bytes_after": destination.stat().st_size,
            "bone_count": len(original_bones), "status": "candidate_needs_visual_review"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--ratio", type=float, default=0.45)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if not 0.1 <= args.ratio <= 0.9:
        parser.error("ratio must be between 0.1 and 0.9")
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, path in SOURCES.items():
        source = Path(path).resolve()
        report[name] = build(source, output / f"{name}-low.glb", args.ratio)
    (output / "report.json").write_text(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
