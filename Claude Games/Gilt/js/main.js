/* GILT — boot: one canvas, letterboxed, everything drawn inside it.
   Pointer events run through the same transform the art does. */
(function () {
  'use strict';
  const SC = window.GiltScenes;
  const E = window.GiltEngine;
  const { S, G, UI, W, H } = SC;

  const canvas = document.getElementById('gilt');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;

  // scale-to-fit with letterbox; nothing ever falls off screen
  let view = { scale: 1, ox: 0, oy: 0 };
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / W, vh / H);
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    canvas.style.left = Math.round((vw - W * scale) / 2) + 'px';
    canvas.style.top = Math.round((vh - H * scale) / 2) + 'px';
    view = { scale, ox: (vw - W * scale) / 2, oy: (vh - H * scale) / 2 };
  }
  window.addEventListener('resize', resize);
  resize();

  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / (r.width / W),
      y: (e.clientY - r.top) / (r.height / H)
    };
  }
  canvas.addEventListener('pointerdown', e => {
    const p = toGame(e);
    S.pointer('down', p.x, p.y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    const p = toGame(e);
    S.pointer('move', p.x, p.y);
  });
  canvas.addEventListener('pointerup', e => {
    const p = toGame(e);
    S.pointer('up', p.x, p.y);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // state
  let storage = null;
  try { storage = window.localStorage; } catch (e) { storage = null; }
  G.storage = storage;
  G.save = E.loadSave(storage);
  G.rng = E.mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const audio = window.GiltAudio.GiltAudio();
  G.audio = audio;

  // loop
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    S.update(dt);
    audio.tick(dt);
    ctx.clearRect(0, 0, W, H);
    S.draw(ctx, dt);
    requestAnimationFrame(frame);
  }

  S.go('title');
  requestAnimationFrame(frame);

  // the harness's handle on everything
  window.__GILT = {
    S, G, UI, E,
    GM: window.GiltGames, A: window.GiltArt, C: window.GiltCopy,
    Cast: window.GiltCast, canvas, view,
    Dialog: SC.Dialog, Talk: SC.Talk
  };
})();
