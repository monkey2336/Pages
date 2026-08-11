/* Boot: load or create the save, run the clock, wire the hidden moderator
   gesture, and keep everything persisted. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;

  function boot() {
    var loaded = G.store.load();
    G.state = loaded || E.newGame();
    E.syncBuilders(G.state);
    E.syncLabSlots(G.state);

    // Catch up on everything that happened while the tab was closed.
    var result = E.tick(G.state, Date.now());
    ui.render();

    if (loaded) {
      if (result.defense) {
        var d = result.defense;
        ui.toast('While you were away: raided for ' + d.destruction + '% (' + d.stars + '★). ' +
          (d.shielded ? 'A shield is up.' : ''), d.stars > 0);
      } else {
        ui.toast('Welcome back to ' + G.thData(G.state.th).name + '.');
      }
    } else {
      ui.toast('Founded a new village. Start with a Gold Mine upgrade.');
    }

    // Game clock: settle timers every second, redraw fully when something
    // actually completed so the player sees it land.
    var lastJobCount = E.inProgressJobs(G.state).length;
    setInterval(function () {
      var res = E.tick(G.state, Date.now());
      var jobs = E.inProgressJobs(G.state).length;
      if (jobs !== lastJobCount) {
        lastJobCount = jobs;
        ui.render();
      } else {
        ui.refreshLive();
      }
      if (res.defense) {
        ui.toast('Your base was attacked — ' + res.defense.destruction + '% destroyed.', true);
        ui.render();
      }
    }, 1000);

    setInterval(function () { G.store.save(G.state); }, 8000);
    window.addEventListener('beforeunload', function () { G.store.save(G.state); });
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') G.store.save(G.state);
    });

    wireModeratorGesture();
  }

  // Spec section 8: long-press the Town Hall to reach the dev menu.
  function wireModeratorGesture() {
    var badge = document.getElementById('thBadge');
    var timer = null;
    function start() {
      clearTimeout(timer);
      timer = setTimeout(function () { G.revealMod(); }, 1200);
    }
    function stop() { clearTimeout(timer); }
    badge.addEventListener('pointerdown', start);
    badge.addEventListener('pointerup', stop);
    badge.addEventListener('pointerleave', stop);
    badge.addEventListener('pointercancel', stop);
    // Keyboard route for anyone not holding a pointer: Shift + M.
    document.addEventListener('keydown', function (ev) {
      if (ev.shiftKey && (ev.key === 'M' || ev.key === 'm')) G.revealMod();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.G = window.G || {});
