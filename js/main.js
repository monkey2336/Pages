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

  /* The moderator panel is yours, not everyone's.

     The game is served from a public URL, so anything the browser can check
     is ultimately readable by anyone who opens the source -- there is no way
     around that in a page with no server. What this does is keep the panel
     out of reach of anyone who has not been told the code: the source carries
     only a hash, so reading the JavaScript does not hand over the passcode.
     Treat it as a lock on a door, not a vault.

     Two ways in, both of which work on a touch screen: press and hold the
     Town Hall badge, or tap it five times quickly. */
  var GATE = 0xaa1fba28;     // hash of the passcode, never the passcode

  function hash(str) {
    var x = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      x ^= str.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x >>> 0;
  }

  function askForCode() {
    // Remembered per device, so you enter it once on the iPad and not again.
    try {
      if (hash(localStorage.getItem('modKey') || '') === GATE) { G.revealMod(); return; }
    } catch (e) { /* private browsing: fall through to the prompt */ }
    var entered = window.prompt('Moderator passcode');
    if (entered == null) return;
    if (hash(entered.trim()) === GATE) {
      try { localStorage.setItem('modKey', entered.trim()); } catch (e) {}
      G.revealMod();
    } else {
      G.ui.toast('Wrong passcode', true);
    }
  }

  function wireModeratorGesture() {
    var badge = document.getElementById('thBadge');
    var timer = null, taps = 0, tapTimer = null;

    function start(ev) {
      clearTimeout(timer);
      timer = setTimeout(askForCode, 900);
      // Five quick taps also opens it -- a long press is awkward on iOS,
      // where it fights the system's own press-and-hold behaviour.
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { taps = 0; }, 2500);
      if (taps >= 5) { taps = 0; clearTimeout(timer); askForCode(); }
      if (ev && ev.pointerType === 'touch') ev.preventDefault();
    }
    function stop() { clearTimeout(timer); }

    badge.addEventListener('pointerdown', start);
    badge.addEventListener('pointerup', stop);
    badge.addEventListener('pointerleave', stop);
    badge.addEventListener('pointercancel', stop);
    // Stop iOS turning the long press into a text-selection callout.
    badge.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

    // Keyboard route for anyone with one: Shift + M.
    document.addEventListener('keydown', function (ev) {
      if (ev.shiftKey && (ev.key === 'M' || ev.key === 'm')) askForCode();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.G = window.G || {});
