# Clone town: remove legacy stacked walls, including attached faces

Owner supplied three screenshots on November 14, 2026, showing huge old
roof/wall layers, knee-height stair-like wall skirts, and narrow interior
passages formed from the previous imported Blender town.

The earlier cleanup incorrectly used whole-mesh exceptions: names like
`Tile_*`, `paving`, `grass`, and `stone` were considered safe floors. The
same source mesh can have **walkable triangles and tall wall/roof triangles**.
Separately, the runtime was re-adding a nine-house procedural living quarter
*after* clearing the old town.

The new final sweep runs **after** critique/floor flattening/riser trimming
and **before** `bakeWolfveilTownCollision`. It removes every raised or
non-walkable interior triangle regardless of mesh name, including roof/wall
faces attached to an otherwise legitimate floor or a giant triangle spanning
the outer border. Only flat low floor faces in genuine floor meshes, water
meshes, and old GLB faces confined to the outer perimeter remain. It updates
index buffers and material groups, hides fully depleted objects, and includes
face removal totals for debugging. Shared geometry is cloned before repeated
edits.

The `CloneTown_LivingQuarter` house rebuild is disabled to honor the
owner's current empty-town instruction. The *separately generated* ancient
tree and circular planter, perimeter dressing, terrain, independent quest NPCs,
and existing water remain intact. No change to main Game 3D.

Important: if the uploaded screenshots depict geometry outside the imported
town or if the Base44 instance is serving stale code, further source-level
identification will be required. This patch needs an actual clone walk-through,
collider check, and visual confirmation after GitHub sync. It has not changed
Base44's live Published version.
