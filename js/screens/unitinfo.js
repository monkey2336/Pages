/* The unit info sheet.

   Clicking any troop, spell, siege machine or hero opens a full stat sheet:
   hitpoints, damage, what it targets, what it goes for first, housing space and
   speed -- plus the design it wears at its current level and the one it earns
   next. Registered as a shared action so every screen can open it. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;

  function statBox(label, value, wide) {
    return '<div class="stat-box' + (wide ? ' wide' : '') + '">' +
      '<span class="stat-label">' + ui.esc(label) + '</span>' +
      '<b>' + value + '</b></div>';
  }

  function unitArt(u, level, px, hero) {
    var key = hero ? SP.heroKey(u.key, level) : SP.unitKey(u.key, level);
    if (key) return SP.img(key, px, u.name);
    if (G.spellData[u.key]) return G.art.spellSVG(u.tint, px);
    return G.art.unitSVG(u.art, u.tint, px, u.air);
  }

  // Stats scale with level the same way the raid maths reads them, so the
  // sheet never disagrees with what the unit actually does in a battle.
  function scaled(base, level, factor) {
    return Math.round(base * Math.pow(factor, Math.max(0, level - 1)));
  }

  function troopSheet(s, t, hero) {
    var lvl = hero
      ? Math.max(1, E.heroState(s, t.key).level)
      : Math.max(1, E.researchLevel(s, t.key));
    var max = hero ? G.heroMaxLevel(t.key, s.th) : E.researchMax(s, t.key);
    var growth = hero ? 1.04 : 1.15;
    var next = Math.min(max, lvl + 1);
    var span = hero ? G.HERO_ART_SPAN : G.TROOP_ART_SPAN;
    var artLvl = hero ? G.heroArtLevel(lvl) : G.troopArtLevel(lvl);
    var artNext = hero ? G.heroArtLevel(next) : G.troopArtLevel(next);
    var targets = t.targets === 'both' ? 'Air &amp; Ground'
      : t.targets === 'air' ? 'Air'
      : t.targets === 'none' ? 'Nothing' : 'Ground';
    var prefers = t.prefers === 'defenses' ? 'Defenses'
      : t.prefers === 'resources' ? 'Resources'
      : t.prefers === 'walls' ? 'Walls' : 'Any';

    var stats = '<div class="stat-grid">' +
      statBox('Hitpoints', ui.fmt(scaled(t.hp || 0, lvl, growth))) +
      statBox('Damage per second', ui.fmt(scaled(t.dps || 0, lvl, growth))) +
      (t.heal ? statBox('Healing per second', ui.fmt(scaled(t.heal, lvl, growth))) : '') +
      statBox('Targets', targets) +
      (hero ? '' : statBox('Favourite target', prefers)) +
      (t.housing ? statBox('Housing space', t.housing) : '') +
      (t.speed ? statBox('Movement speed', t.speed) : '') +
      statBox('Trained with', t.res === 'dark' ? 'Dark Elixir' : 'Elixir') +
      '</div>';

    var abilities = hero
      ? '<div class="panel"><h3>Ability</h3><p class="hint" style="margin:0"><b>' +
        ui.esc(t.ability) + '</b> — ' + ui.esc(t.abilityText) + '</p></div>'
      : '<div class="panel"><h3>Role</h3><p class="hint" style="margin:0">' +
        ui.esc(t.role) + '</p></div>';

    var design = '<div class="panel"><h3>Design</h3>' +
      '<p class="hint" style="margin:0 0 8px">Every level has its own kit — ' +
      ui.esc(G.eraFor(artLvl, span).name) + ' at this level.</p>' +
      (next > lvl
        ? '<div class="art-compare">' +
          '<figure>' + unitArt(t, artLvl, 84, hero) + '<figcaption>level ' + lvl + '</figcaption></figure>' +
          '<span class="art-arrow">→</span>' +
          '<figure>' + unitArt(t, artNext, 84, hero) + '<figcaption>level ' + next + '</figcaption></figure>' +
          '</div>'
        : artLvl < span
          // Maxed for this Town Hall is not the same as out of designs.
          ? '<div class="art-compare">' +
            '<figure>' + unitArt(t, artLvl, 84, hero) + '<figcaption>level ' + lvl + '</figcaption></figure>' +
            '<span class="art-arrow">→</span>' +
            '<figure>' + unitArt(t, artLvl + 1, 84, hero) +
              '<figcaption>level ' + (lvl + 1) + ' · needs a higher Town Hall</figcaption></figure>' +
            '</div>'
          : '<p class="hint" style="margin:0">Final design reached.</p>') +
      '</div>';

    var action = '';
    if (hero) {
      var hs = E.heroState(s, t.key);
      if (hs.upgrading) {
        action = ui.jobHTML(hs.upgrading, 'data-act="skip-hero" data-key="' + t.key + '"');
      } else if (E.heroUnlocked(s, t.key) && hs.level >= max) {
        action = G.upgradeSheet.ceilingPill(
          G.upgradeSheet.heroTHFor(t.key, t.unlockTH, hs.level + 1));
      } else if (E.heroUnlocked(s, t.key) && hs.level < max) {
        action = '<button class="btn wide" data-act="upgrade-hero" data-key="' + t.key + '">' +
          (hs.level === 0 ? 'Summon' : 'Upgrade to ' + (hs.level + 1)) + ' · ' +
          ui.fmt(E.heroCost(t.key, Math.max(1, hs.level + 1))) + ' ' + t.res + '</button>';
      }
    } else if (E.researchTarget(t.key)) {
      var inLab = s.labSlots.some(function (sl) { return sl.job && sl.job.key === t.key; });
      var rmax = E.researchMax(s, t.key);
      var rlvl = E.researchLevel(s, t.key);
      if (inLab) {
        action = '<span class="pill warn">In the Laboratory</span>';
      } else if (s.th < t.unlockTH) {
        action = '<span class="pill">Unlocks at Town Hall ' + t.unlockTH + '</span>';
      } else if (G.troopData[t.key] && !E.troopUnlocked(s, t.key)) {
        action = '<span class="pill">Needs ' + ui.esc(E.troopBlockedBy(s, t.key)) + '</span>';
      } else if (rlvl < rmax) {
        action = '<button class="btn wide" data-act="start-research" data-key="' + t.key + '">' +
          'Research to ' + (rlvl + 1) + ' · ' + ui.fmt(E.researchCost(s, t.key, rlvl + 1)) + ' ' +
          (t.res || 'elixir') + ' · ' + ui.fmtTime(E.researchSeconds(s, t.key, rlvl + 1)) + '</button>';
      } else {
        action = G.upgradeSheet.ceilingPill(
          G.upgradeSheet.researchTHFor(t.unlockTH, rlvl + 1));
      }
    }

    return '<h3>' + ui.esc(t.name) + (hero ? '' : ' · level ' + lvl + '/' + max) + '</h3>' +
      '<div class="unit-sheet">' +
        '<div class="unit-portrait">' + unitArt(t, artLvl, 150, hero) + '</div>' +
        '<div class="unit-stats">' + stats + '</div>' +
      '</div>' +
      abilities + design + action;
  }

  ui.actions['unit-info'] = function (el) {
    var s = G.state;
    var key = el.getAttribute('data-key');
    var hero = el.getAttribute('data-hero') === '1';
    var u = hero ? G.heroData[key]
      : (G.troopData[key] || G.siegeData[key] || G.spellData[key]);
    if (!u) return;
    if (G.spellData[key] && !G.troopData[key]) {
      // Spells have their own smaller sheet: no HP, no speed.
      var lvl = Math.max(1, E.researchLevel(s, key));
      ui.modal('<h3>' + ui.esc(u.name) + ' · level ' + lvl + '</h3>' +
        '<div class="unit-sheet"><div class="unit-portrait">' + G.art.spellSVG(u.tint, 140) + '</div>' +
        '<div class="unit-stats"><div class="stat-grid">' +
          statBox('Spell slots', u.slots) +
          statBox('Brewed with', u.res === 'dark' ? 'Dark Elixir' : 'Elixir') +
          statBox('Brew cost', ui.fmt(E.spellCost(s, key))) +
          statBox('Research level', lvl + '/' + E.researchMax(s, key)) +
        '</div></div></div>' +
        '<div class="panel"><h3>Effect</h3><p class="hint" style="margin:0">' + ui.esc(u.role) + '</p></div>');
      return;
    }
    ui.modal(troopSheet(s, u, hero));
  };

  G.unitInfo = { sheet: troopSheet };
})(window.G = window.G || {});
