/* ============ Foundry — boot + fixed-timestep loop ============ */
(function(root){
'use strict';
const F = root.F;

const SIM_DT = 1 / 60;
let last = 0, acc = 0;

function frame(now){
  requestAnimationFrame(frame);
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > .25) dt = .25;           // tab-back: don't spiral

  const S = F.ui.S;
  if (S){
    const speed = F.ui.speed == null ? 1 : F.ui.speed;   // 0 = paused, 1/2/3 = fast-forward
    if (!S.won || S.freeplay){
      acc += dt * speed;
      let steps = 0;
      const cap = 30 * Math.max(1, speed);
      while (acc >= SIM_DT && steps < cap){
        F.tick(S, SIM_DT);
        acc -= SIM_DT;
        steps++;
      }
      if (steps >= cap) acc = 0;
    } else {
      // ending cutscene: one fixed slow pace on every monitor. Keep Building
      // sets freeplay and hands the speed controls back.
      acc += dt * 0.35;
      let steps = 0;
      while (acc >= SIM_DT && steps < 30){
        F.tick(S, SIM_DT);
        acc -= SIM_DT;
        steps++;
      }
      if (steps >= 30) acc = 0;
    }
    F.ui.update(dt);
    F.render.draw(S, dt, F.ui.viewState());
  }
}

function boot(){
  F.ui.init();
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* headless / debug hook */
root.__FOUNDRY = F;

})(typeof window !== 'undefined' ? window : globalThis);
