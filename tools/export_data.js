/* Dumps the game's data tables to JSON so the Blender sprite renderer can
   build geometry from the same source of truth the game plays from.
   Usage: node tools/export_data.js > tools/gamedata.json */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);

['js/data/townhalls.js', 'js/data/buildings.js', 'js/data/army.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});

const G = sandbox.window.G;
const out = {
  townHalls: G.TOWN_HALLS.map(function (t) {
    return {
      level: t.level, name: t.name, tier: t.tier,
      palette: t.palette, design: t.design
    };
  }),
  buildings: G.BUILDINGS.map(function (b) {
    return { key: b.key, name: b.name, cat: b.cat, art: b.art, size: b.size, unlockTH: b.unlockTH };
  }),
  wallSkins: Array.from({ length: 30 }, function (_, i) {
    const s = G.WALL.skin(i + 1);
    return { level: i + 1, name: s.name, fill: s.fill, edge: s.edge, glow: s.glow || null };
  }),
  troops: G.TROOPS.map(function (t) {
    return { key: t.key, name: t.name, art: t.art, tint: t.tint, housing: t.housing, air: !!t.air, res: t.res };
  }),
  heroes: G.HEROES.map(function (h) {
    return { key: h.key, name: h.name, art: h.art, tint: h.tint };
  }),
  siege: G.SIEGE.map(function (m) {
    return { key: m.key, name: m.name, art: m.art, tint: m.tint };
  }),
  spells: G.SPELLS.map(function (s) {
    return { key: s.key, name: s.name, tint: s.tint, res: s.res };
  })
};

process.stdout.write(JSON.stringify(out, null, 1));
