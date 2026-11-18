# Weapons a player can equip from this repository

| Weapon | In hand | Model file | Inventory picture |
| --- | --- | --- | --- |
| Sword (any item of the sword family without its own model) | `fantasy_sword` | `public/game3d/weapons/fantasy_sword.glb` | `icons/fantasy_sword.png` |
| Dagger pair (the dual blades family) | one blade in each hand | `public/game3d/weapons/curved_daggers.glb` (nodes `DaggerRight`, `DaggerLeft`) | `icons/curved_daggers.png` |
| Bow (any item of the bow family without its own model) | `violet_bow` | `public/game3d/weapons/violet_bow.glb` | `icons/violet_bow.png` |

## Where the models come from

- The sword is the owner's "fantasy sword 3d model.glb". It was already light (19,357 triangles), so it only
  needed placing in the weapon pack's frame and smaller textures. It is placed so its tip is where the pack
  manifest already says, so the grips the manifest holds for it still fit.
- The daggers are the owner's "fantasy curved blades 3d model.glb": one file holding a matched pair (4,906
  triangles). It is split into its two blades; each gets its own frame (grip centre at the origin, +Y along
  the handle to the blade, +Z the outer curve).
- The bow was already in the repository.

`tools/game3d-weapons/prepare_lowpoly_weapons.py` does this and renders the pictures. It needs only Python
with numpy and Pillow.

## Still missing

The pack manifest also lists the energy sword, the odachi, the fantasy bow and the ornate bow. Their files
are not in this repository, and their sources are too heavy to ship as they are: they need
`tools/game3d-weapons/build-weapons.mjs`, which runs Blender. Until then an item that names one of them
shows nothing in hand, and other players' bows (which use the fantasy bow) are not drawn.

## Pictures in the inventory

A weapon item with no picture of its own gets the pack picture of the model it is drawn with
(`src/components/game3d/weapons/weaponPackPictures.mjs`). The inventory store applies it to the starting
items and to saved items alike, so an inventory saved before the pictures existed shows them too.

## The hand

Swords and bows use the grip and the finger pose the pack manifest holds for each body. The daggers use the
weapon runtime's own grip solver with the daggers' handle radius. The check
(`tests/game3d-equipable-weapons.test.mjs`) equips each weapon on the real female and male bodies through the
real weapon runtime and measures that the grip sits in the palm and the fingertips close onto the handle.
