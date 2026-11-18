# Sword moves from motion capture

Turns a Rokoko video capture into sword moves the game can play on any body with any sword.

## Why not play the capture as it is

A Rokoko export moves Rokoko's own skeleton ("Newton"), not the game's characters, and it has no sword in
it. The game's combo baker (`src/components/game3d/weapons/weaponComboClips.js`) already poses each body from
keys written in body space and solves the hands onto the held weapon's own grip. So this tool measures the
capture in those same terms and writes keys:

- hips: how low, how far turned, and how far they travel over the feet
- spine: twist, bend and lean of the chest
- each wrist relative to its shoulder, and which way each elbow points
- each foot on the ground (where, which way it points, how high it is lifted) and which way each knee points
- the blade: the line through both hands while they share the hilt
- where the head looks

The baker then fits those keys to the female body, the male body and any other rig it knows, with both
hands on the hilt of whichever sword is held.

## Use

Needs Python 3 with numpy.

1. Export the capture from Rokoko as FBX (30 frames a second, the Newton skeleton).
2. List the strokes in it:

   ```
   python3 tools/game3d-mocap/sword_moves_from_capture.py strokes path/to/capture.fbx
   ```

   Each row is one fast movement of the hands: where it starts, where it lands, where it ends.
3. Name the ones worth keeping in `katana-cuts.json`: an id, a name, and the start, hit and end times.
   Moves in one group follow each other in the capture, so each begins in the pose the last one ended in.
4. Write the moves:

   ```
   python3 tools/game3d-mocap/sword_moves_from_capture.py moves tools/game3d-mocap/katana-cuts.json \
     --captures path/to/folder/with/the/fbx/files \
     --out src/components/game3d/weapons/katanaCapturedMoves.mjs
   ```
5. Add a combo of three move ids to `KATANA_COMBOS` in `src/components/game3d/weapons/katanaTechniques.mjs`.

The capture files themselves are not kept in this repository.

## What a capture needs to be usable

- The whole body in the picture for the whole move. A close-up gives guessed legs.
- Both hands on the hilt, so the blade's line can be read from them.
- Feet on the ground. A flip or a cartwheel needs the capture played bone for bone, which this tool does not do.
