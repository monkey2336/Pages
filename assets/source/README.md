# Drop texture and model files here

Anything in this folder is **source material**, not something the game loads
directly. Textures get wrapped onto the existing building geometry and the
result is re-rendered into `assets/sprites/`; models get rendered through the
same isometric camera everything else uses.

## What is useful

Textures, ideally 1K or 2K JPG or PNG — bigger is wasted at sprite size:

| Looking for | Used on |
|---|---|
| stone / ashlar / brick wall | building walls, walls, Town Hall plinths |
| wood planks / timber | carriages, frames, doors, roofs |
| roof tiles / slate / thatch | every roof |
| gold, brass, worn metal | trim, bands, machinery |
| dirt / grass | the pads buildings stand on |

Low-poly models in `.glb`, `.gltf`, `.obj` or `.fbx` also work.

## Licensing

This repository is public, so committing a file here is **redistributing** it.

- **CC0 / public domain** — no restrictions, nothing to do. Prefer this.
- **CC-BY** — fine, but the author must be credited. Say so and a credits file
  gets added naming them.
- **"Free to use but do not redistribute"** — common on itch.io and CraftPix,
  and *not* usable here, because a public repo redistributes by definition.

Poly Haven and ambientCG are entirely CC0, which is why they are the
suggestion. When in doubt, paste the licence text along with the file.

## Naming

No naming scheme required — say what each file is when you add it. If you want
to make it obvious, prefix by kind: `stone_*`, `wood_*`, `roof_*`, `metal_*`,
`ground_*`.
