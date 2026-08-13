# KayKit Adventurers — weapons and shields

Swords, axes, bows, daggers, staves, shields and props. Only the `Assets/gltf`
folder is vendored; the pack's own characters and animations are not used.

Created and distributed by **Kay Lousberg** (www.kaylousberg.com), released
under **Creative Commons Zero (CC0)** — free for personal, educational and
commercial use, redistribution included, credit appreciated but not required.
The full text is in `LICENSE.txt`.

The models are authored with the grip on the origin and the blade running up
+z, which is the convention the procedural weapons were already built to, so
they drop straight into a troop's fist. `KIT_WEAPONS` in
`tools/render_sprites.py` maps our weapon kinds onto them. Kinds the pack does
not cover — club, hammer, spear, lance, standard — keep their procedural build
rather than being forced onto a model that is not one.

Each model's texture is blended toward the level palette so a troop's weapon
still re-themes as it ranks up.
