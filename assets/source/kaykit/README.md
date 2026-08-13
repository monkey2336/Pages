# KayKit character rig and animations

The skeleton and animation clips the troops are posed with.

    rig_medium.glb    the 21-bone humanoid rest pose (T-pose)
    anim_movement.glb walk and run cycles, jumps
    anim_melee.glb    one-handed, two-handed and unarmed attacks, blocks
    anim_ranged.glb   bow, crossbow and spellcasting
    anim_general.glb  idle, hit reactions, deaths, spawns

Created and distributed by **Kay Lousberg** (www.kaylousberg.com), released
under **Creative Commons Zero (CC0)** — free for personal, educational and
commercial use, redistribution included, credit appreciated but not required.
The full text is in `LICENSE.txt`.

The mannequin meshes that ship with the pack are not used; only the skeleton
and the actions are. Every visible part of every troop is still the
procedural geometry built by `tools/render_sprites.py`, bound to these bones
by `tools/render_troops_anim.py`.
