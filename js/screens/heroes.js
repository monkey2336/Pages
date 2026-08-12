/* Hero Hall: hero levels, abilities, two equipment slots each, and pets. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;


  // The Town Hall that lifts a hero's ceiling past a given level, or null when
  // the hero has nowhere left to go.
  function thForHeroLevel(h, level) {
    for (var th = h.unlockTH; th <= 30; th++) {
      if (G.heroMaxLevel(h.key, th) >= level) return th;
    }
    return null;
  }

  function heroIcon(h, px, level) {
    var key = SP.heroKey(h.key, level || 1);
    return key ? SP.img(key, px, h.name) : G.art.unitSVG(h.art, h.tint, px);
  }

  function heroCard(s, h) {
    var hs = E.heroState(s, h.key);
    var unlocked = E.heroUnlocked(s, h.key);
    var maxLvl = G.heroMaxLevel(h.key, s.th);
    var next = hs.level + 1;
    var cost = E.heroCost(h.key, Math.max(1, next));
    var secs = E.heroSeconds(s, h.key, Math.max(1, next));
    var short = cost > (s.resources[h.res] || 0);

    var equipped = hs.equipment.map(function (k) {
      var e = G.equipmentData[k];
      return '<span class="pill" title="' + ui.esc(e.effect) + '">' + ui.esc(e.name) + '</span>';
    }).join(' ') || '<span class="hint">no equipment</span>';

    var pet = hs.pet ? '<span class="pill ok">' + ui.esc(G.petData[hs.pet].name) + '</span>' : '<span class="hint">no pet</span>';

    return '<div class="card' + (unlocked ? '' : ' locked') + '" style="flex-direction:column">' +
      '<div style="display:flex;gap:10px;width:100%">' +
        '<div class="icon info-hit" data-act="unit-info" data-key="' + h.key + '" data-hero="1" title="Stats">' +
          heroIcon(h, 56, Math.max(1, hs.level)) + '</div>' +
        '<div class="body">' +
          '<div class="title"><span class="info-hit" data-act="unit-info" data-key="' + h.key +
            '" data-hero="1">' + ui.esc(h.name) + '</span>' +
            '<small>' + (unlocked ? 'lvl ' + hs.level + '/' + maxLvl : 'TH' + h.unlockTH) + '</small></div>' +
          '<div class="desc"><b>' + ui.esc(h.ability) + '</b> — ' + ui.esc(h.abilityText) + '</div>' +
          '<div class="stat-row" style="margin-bottom:6px">' +
            '<span>DPS <b>' + Math.round(h.dps * Math.pow(1.04, Math.max(0, hs.level - 1))) + '</b></span>' +
            '<span>HP <b>' + Math.round(h.hp * Math.pow(1.04, Math.max(0, hs.level - 1))) + '</b></span>' +
            '<span>Fuel <b>' + h.res + '</b></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="width:100%">' +
        (!unlocked
          ? '<span class="pill">Unlocks at Town Hall ' + h.unlockTH + ' with a Hero Hall</span>'
          : hs.upgrading
            ? ui.jobHTML(hs.upgrading, 'data-act="skip-hero" data-key="' + h.key + '"')
            : hs.level >= maxLvl
              ? thForHeroLevel(h, hs.level + 1)
                ? '<span class="pill">Town Hall ' + thForHeroLevel(h, hs.level + 1) + ' for the next level</span>'
                : '<span class="pill max">Max level</span>'
              : '<button class="btn sm" data-act="upgrade-hero" data-key="' + h.key + '">' +
                (hs.level === 0 ? 'Summon' : 'Upgrade to ' + next) + ' · ' + ui.fmt(cost) + ' ' + h.res + '</button>' +
                '<div class="timer">' + ui.fmtTime(secs) + (short ? ' · not enough ' + h.res : '') + '</div>') +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
          '<span class="hint">Equipment:</span>' + equipped +
          '<button class="btn sm ghost" data-act="hero-equip" data-key="' + h.key + '">Manage</button>' +
        '</div>' +
        '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
          '<span class="hint">Pet:</span>' + pet +
          '<button class="btn sm ghost" data-act="hero-pet" data-key="' + h.key + '">Assign</button>' +
        '</div>' +
      '</div>' +
      '</div>';
  }

  function render(s) {
    var hallLevel = E.heroHallLevel(s);
    var head = '<h2 class="screen-head">Hero Hall</h2>' +
      '<p class="screen-sub">Heroes are trained here rather than by your Builders — the Hall can work on ' +
      E.heroSlotsTotal(s) + (E.heroSlotsTotal(s) === 1 ? ' hero' : ' heroes') + ' at a time. Equipment is forged in the Blacksmith; pets come from the Pet House.</p>';

    if (!hallLevel) {
      return head + '<div class="panel"><h3>No Hero Hall</h3><p class="hint">Build the Hero Hall in the village (unlocks at Town Hall 7) to summon your first hero, the Vanguard.</p></div>';
    }

    var busy = E.heroSlotsBusy(s);
    var stat = '<div class="panel"><h3>Hall status</h3><div class="stat-row">' +
      '<span>Hall level <b>' + hallLevel + '</b></span>' +
      '<span>Training slots <b>' + busy + '/' + E.heroSlotsTotal(s) + '</b> in use</span>' +
      '<span>Heroes unlocked <b>' + G.HEROES.filter(function (h) { return E.heroUnlocked(s, h.key); }).length +
        '</b>/' + G.HEROES.length + '</span>' +
      '<span>Blacksmith <b>' + (E.ownedCount(s, 'blacksmith') ? 'built' : 'not built') + '</b></span>' +
      '<span>Pet House <b>' + (E.ownedCount(s, 'pethouse') ? 'built' : 'not built') + '</b></span>' +
      '</div></div>';

    return head + stat + '<div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">' +
      G.HEROES.map(function (h) { return heroCard(s, h); }).join('') + '</div>';
  }

  function live(host) { ui.tickTimers(host); }

  /* ---------------------------------------------------------- actions */
  ui.actions['upgrade-hero'] = function (el) {
    if (ui.report(E.upgradeHero(G.state, el.getAttribute('data-key')), 'Hero training started')) ui.render();
  };

  ui.actions['skip-hero'] = function (el) {
    var key = el.getAttribute('data-key');
    var job = E.inProgressJobs(G.state).filter(function (j) { return j.kind === 'hero' && j.key === key; })[0];
    if (job && ui.report(E.skipWithGems(G.state, job))) ui.render();
  };

  ui.actions['hero-equip'] = function (el) {
    var s = G.state, key = el.getAttribute('data-key');
    var h = G.heroData[key], hs = E.heroState(s, key);
    var list = G.EQUIPMENT.filter(function (e) { return e.hero === key; });
    ui.modal('<h3>' + ui.esc(h.name) + ' — equipment</h3>' +
      '<p class="screen-sub">Two slots. Forge and upgrade pieces in the Blacksmith with Shiny, Glowy and Starry Ore.</p>' +
      '<div class="grid-cards">' + list.map(function (e) {
        var on = hs.equipment.indexOf(e.key) >= 0;
        var avail = E.equipmentUnlocked(s, e.key);
        return '<div class="card' + (avail ? '' : ' locked') + '"><div class="body">' +
          '<div class="title">' + ui.esc(e.name) + '<small>' + e.rarity + '</small></div>' +
          '<div class="desc">' + ui.esc(e.effect) + '</div>' +
          (avail
            ? '<button class="btn sm' + (on ? ' ghost' : '') + '" data-act="toggle-equip" data-hero="' + key +
              '" data-eq="' + e.key + '">' + (on ? 'Unequip' : 'Equip') + '</button>'
            : '<span class="pill">Town Hall ' + e.unlockTH + ' + Blacksmith</span>') +
          '</div></div>';
      }).join('') + '</div>');
  };

  ui.actions['toggle-equip'] = function (el) {
    var r = E.toggleEquipment(G.state, el.getAttribute('data-hero'), el.getAttribute('data-eq'));
    if (ui.report(r, 'Loadout updated')) {
      ui.actions['hero-equip']({ getAttribute: function () { return el.getAttribute('data-hero'); } });
      ui.render();
    }
  };

  ui.actions['hero-pet'] = function (el) {
    var s = G.state, key = el.getAttribute('data-key');
    var hs = E.heroState(s, key);
    ui.modal('<h3>' + ui.esc(G.heroData[key].name) + ' — pet</h3>' +
      '<p class="screen-sub">Each pet may only follow one hero.</p>' +
      '<div class="grid-cards">' + G.PETS.map(function (p) {
        var taken = Object.keys(s.heroes).filter(function (k) { return k !== key && s.heroes[k].pet === p.key; })[0];
        var avail = s.th >= p.unlockTH && E.ownedCount(s, 'pethouse') > 0;
        return '<div class="card' + (avail ? '' : ' locked') + '">' +
          '<div class="icon">' + G.art.unitSVG('pet', p.tint, 40) + '</div><div class="body">' +
          '<div class="title">' + ui.esc(p.name) + '<small>TH' + p.unlockTH + '</small></div>' +
          '<div class="desc">' + ui.esc(p.effect) + (taken ? ' · with ' + ui.esc(G.heroData[taken].name) : '') + '</div>' +
          (avail
            ? '<button class="btn sm' + (hs.pet === p.key ? ' ghost' : '') + '" data-act="assign-pet" data-hero="' + key +
              '" data-pet="' + p.key + '">' + (hs.pet === p.key ? 'Send home' : 'Assign') + '</button>'
            : '<span class="pill">Needs Pet House · TH' + p.unlockTH + '</span>') +
          '</div></div>';
      }).join('') + '</div>');
  };

  ui.actions['assign-pet'] = function (el) {
    var hero = el.getAttribute('data-hero');
    if (ui.report(E.assignPet(G.state, hero, el.getAttribute('data-pet')), 'Pet updated')) {
      ui.closeModal();
      ui.render();
    }
  };

  ui.register('heroes', {
    title: 'Hero Hall',
    render: render,
    live: live,
    badge: function (s) {
      var n = E.heroSlotsBusy(s);
      return n ? n + ' training' : '';
    }
  });
})(window.G = window.G || {});
