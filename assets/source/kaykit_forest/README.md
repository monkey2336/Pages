# KayKit Forest Nature Pack

Trees, bushes, rocks and grass tufts used for the village surroundings.

Created and distributed by **Kay Lousberg** (www.kaylousberg.com), released
under **Creative Commons Zero (CC0)** — free for personal, educational and
commercial use, redistribution included, credit appreciated but not required.
The full text is in `LICENSE.txt`.

Only the `gltf` folder is vendored (models, buffers and the shared texture
atlas). The pack also ships fbx and obj copies of the same models, which the
renderer has no use for.

`tools/render_kit.py` picks a subset — chosen by rendering all 105 models
small and looking at them, not by name — and renders them through the game's
isometric camera into `assets/sprites/sc_k*.png`.
