/* The Town Hall gallery — all 30 levels, each with its own name, palette,
   architecture and unlock list. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;

  var TIER_COLOR = {
    Tutorial: '#7f9a55', Early: '#5f7f9a', Mid: '#7f5f9a', Late: '#9a5f4f',
    Endgame: '#4f8a7a', Ascendant: '#6f4f9a', Prestige: '#4f6f9a',
    Mythic: '#5a4f8a', Titan: '#9a7a3f', Apex: '#9a3f7a'
  };

  function tile(s, t) {
    return '<div class="th-tile' + (t.level === s.th ? ' current' : '') + '" data-act="th-detail" data-lvl="' + t.level + '">' +
      '<span class="lvl-chip">TH' + t.level + '</span>' +
      '<span class="tier-chip" style="background:' + (TIER_COLOR[t.tier] || '#555') + '">' + t.tier + '</span>' +
      G.art.townHallSVG(t.level, 200) +
      '<b>' + ui.esc(t.name) + '</b>' +
      '<span>' + ui.fmt(t.campCapacity) + ' housing · ' + t.builders + ' builders</span>' +
      '<div class="swatches">' +
        ['accent', 'accent2', 'roof', 'stone', 'wall', 'glow'].map(function (k) {
          return '<i style="background:' + t.palette[k] + '" title="' + k + ' ' + t.palette[k] + '"></i>';
        }).join('') +
      '</div></div>';
  }

  function render(s) {
    return '<h2 class="screen-head">Town Halls</h2>' +
      '<p class="screen-sub">Thirty Town Halls, thirty identities. Each level has its own name, silhouette, ' +
      'ornament set and colour palette — and the whole interface re-skins to match whichever one you are sitting in.</p>' +
      '<div class="th-gallery">' + G.TOWN_HALLS.map(function (t) { return tile(s, t); }).join('') + '</div>';
  }

  ui.actions['th-detail'] = function (el) {
    var lvl = parseInt(el.getAttribute('data-lvl'), 10);
    var t = G.thData(lvl);
    var s = G.state;
    var d = t.design;
    var swatch = function (k) {
      return '<div style="display:flex;align-items:center;gap:8px;font-size:12px">' +
        '<i style="width:22px;height:22px;border-radius:5px;background:' + t.palette[k] + ';border:1px solid #0006;display:block"></i>' +
        '<span>' + k + '<br><span class="hint">' + t.palette[k] + '</span></span></div>';
    };
    ui.modal('<h3>Town Hall ' + t.level + ' — ' + ui.esc(t.name) + '</h3>' +
      '<p class="screen-sub">' + ui.esc(t.lore) + '</p>' +
      '<div style="text-align:center">' + G.art.townHallSVG(t.level, 220) + '</div>' +
      '<div class="panel"><h3>Design</h3><div class="stat-row">' +
        '<span>Body <b>' + d.body + '</b></span>' +
        '<span>Roof <b>' + d.roof + '</b></span>' +
        '<span>Towers <b>' + d.towers + '</b></span>' +
        '<span>Banners <b>' + d.banners + '</b></span>' +
        '<span>Terraces <b>' + d.steps + '</b></span>' +
        '<span>Rings <b>' + d.rings + '</b></span>' +
        '<span>Orbs <b>' + d.orbs + '</b></span>' +
        '<span>Motif <b>' + d.motif + '</b></span>' +
      '</div></div>' +
      '<div class="panel"><h3>Palette</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">' +
        ['accent', 'accent2', 'glow', 'roof', 'stone', 'wall', 'sky1', 'sky2', 'panel'].map(swatch).join('') +
        '</div></div>' +
      '<div class="panel"><h3>At this Town Hall</h3><div class="stat-row">' +
        '<span>Tier <b>' + t.tier + '</b></span>' +
        '<span>Builders <b>' + t.builders + '</b></span>' +
        '<span>Max upgrade time <b>' + ui.fmtTime(t.maxUpgradeSeconds) + '</b></span>' +
        '<span>Army housing <b>' + t.campCapacity + '</b></span>' +
        '<span>Spell slots <b>' + t.spellCapacity + '</b></span>' +
        '<span>Storage cap <b>' + ui.fmt(t.storageCap) + '</b></span>' +
        (t.darkStorageCap ? '<span>Dark cap <b>' + ui.fmt(t.darkStorageCap) + '</b></span>' : '') +
        '<span>Wall level <b>' + t.wallMaxLevel + '</b> (' + ui.esc(G.WALL.skin(t.wallMaxLevel).name) + ')</span>' +
        '<span>Heroes <b>' + t.heroSlots + '</b></span>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px">Unlocks: ' + ui.esc(t.unlocks.join(', ')) + '</p>' +
      (t.level > 1 ? '<p class="hint">Upgrade cost from ' + (t.level - 1) + ': ' + ui.fmt(t.upgradeCost) +
        ' gold · ' + ui.fmtTime(t.upgradeSeconds) + '</p>' : '') +
      '</div>' +
      (s.th === t.level ? '<span class="pill ok">This is your Town Hall</span>' : ''));
  };

  ui.register('townhalls', { title: 'Town Halls', render: render });
})(window.G = window.G || {});
