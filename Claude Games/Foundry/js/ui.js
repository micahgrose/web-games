/* ============ Foundry — UI: build bar, panels, input, teaching ============ */
(function(root){
'use strict';
const F = root.F;
const R = F.render;
const A = F.audio;
const { DX, DY, clamp } = F;

const UI = F.ui = {
  S: null,
  tool: null, dir: 1,
  hover: null,           // [tx,ty] under cursor
  selection: null,
  activeCat: 'ext',
  bigTab: null,
  pointer: { x: 0, y: 0, down: false, btn: 0, id: null, panning: false, moved: 0,
             lastTile: null, mining: false, sx: 0, sy: 0, camx: 0, camy: 0 },
  keys: {},
  toastSeen: {},
  autosaveT: 0,
  uiT: 0,
  arrow: null,
  started: false,
  cineStage: 0,
};

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const SAVE_KEY = 'foundry_save_v1';

/* ==================================================================== */
/* INIT                                                                 */
/* ==================================================================== */
UI.init = function(){
  R.init($('game'));
  root.addEventListener('resize', () => R.resize());

  bindPointer();
  bindKeys();
  bindHud();
  initTitle();
};

function hasSave(){
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e){ return false; }
}
UI.save = function(){
  if (!UI.S || R.cine) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(F.serialize(UI.S))); } catch (e){}
};
function loadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return F.deserialize(JSON.parse(raw));
  } catch (e){ return null; }
}

/* ==================================================================== */
/* TITLE                                                                */
/* ==================================================================== */
let titleRaf = null;
function initTitle(){
  const btnC = $('btnContinue'), btnN = $('btnNew');
  if (hasSave()) btnC.classList.remove('hidden');
  btnC.addEventListener('click', () => {
    A.init(); A.resume();
    const S = loadSave();
    startGame(S || F.newGame());
  });
  btnN.addEventListener('click', () => {
    A.init(); A.resume();
    if (hasSave() && !btnN.dataset.confirm){
      btnN.dataset.confirm = '1';
      btnN.textContent = 'OVERWRITE SAVE?';
      setTimeout(() => { btnN.dataset.confirm = ''; btnN.textContent = 'NEW WORLD'; }, 2600);
      return;
    }
    try { localStorage.removeItem(SAVE_KEY); } catch (e){}
    startGame(F.newGame());
  });
  const fx = $('titleFx');
  let t0 = performance.now();
  const tick = (now) => {
    if ($('title').classList.contains('hidden')) return;
    R.titleFx(fx, 0, (now - t0) / 1000);
    titleRaf = requestAnimationFrame(tick);
  };
  titleRaf = requestAnimationFrame(tick);
}

function startGame(S){
  UI.S = S;
  R.buildGround(S);
  // camera on core
  R.cam.x = S.core.x + S.core.w / 2;
  R.cam.y = S.core.y + S.core.h / 2;
  R.cam.zoom = 1.15;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (titleRaf) cancelAnimationFrame(titleRaf);
  UI.started = true;
  buildTabs();
  buildBar();
  refreshObjective();
  if (S.msIndex === 0 && !S.flags.welcomed){
    S.flags.welcomed = true;
    toast('The Core is dark. Hold <b>left-click</b> on an ore deposit to mine by hand.', 'tip', 9000);
  }
}

/* ==================================================================== */
/* POINTER INPUT                                                        */
/* robust: state machine on the canvas; last-known position drives      */
/* everything each frame (no reliance on a steady event stream).        */
/* ==================================================================== */
function bindPointer(){
  const cv = $('game');
  const P = UI.pointer;

  cv.addEventListener('pointerdown', (e) => {
    A.init(); A.resume();
    P.x = e.clientX; P.y = e.clientY;
    P.down = true; P.btn = e.button; P.id = e.pointerId;
    P.moved = 0; P.sx = e.clientX; P.sy = e.clientY;
    P.camx = R.cam.x; P.camy = R.cam.y;
    P.lastTile = tileUnder(e.clientX, e.clientY);
    P.panning = (e.button === 1);
    if (e.button === 0){
      if (UI.tool) placeAt(P.lastTile, true);
      // selection / mining resolved on up (if not dragged) or per-frame (mining)
    } else if (e.button === 2){
      if (UI.tool){ setTool(null); }
      else removeAt(P.lastTile);
    }
    // always capture: guarantees we see pointerup even if released off-window,
    // so held-to-mine / drag states can never stick
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  });

  cv.addEventListener('pointermove', (e) => {
    if (P.id !== null && e.pointerId !== P.id && P.down) return;
    const px = e.clientX, py = e.clientY;
    P.moved += Math.abs(px - P.x) + Math.abs(py - P.y);
    P.x = px; P.y = py;
    if (P.down && P.panning){
      const s = R.tilePx();
      R.cam.x = P.camx - (px - P.sx) / s;
      R.cam.y = P.camy - (py - P.sy) / s;
      clampCam();
      return;
    }
    if (P.down && P.btn === 0 && UI.tool){
      dragPlace(px, py);
    } else if (P.down && P.btn === 2 && !UI.tool){
      const t = tileUnder(px, py);
      if (t) removeAt(t);
    } else if (P.down && P.btn === 0 && !UI.tool){
      // drag-pan with left on empty ground (after small threshold, not while mining)
      if (P.moved > 8 && !P.mining){
        const s = R.tilePx();
        R.cam.x = P.camx - (px - P.sx) / s;
        R.cam.y = P.camy - (py - P.sy) / s;
        clampCam();
      }
    }
  });

  const endPointer = (e) => {
    if (P.id !== null && e.pointerId !== P.id) return;
    if (P.down && P.btn === 0 && !UI.tool && P.moved <= 8 && !P.mining){
      // a clean click: select
      const t = tileUnder(e.clientX, e.clientY);
      const ent = t && F.entAt(UI.S, t[0], t[1]);
      if (ent && ent.kind !== 'core') select(ent);
      else if (ent && ent.kind === 'core'){ openBig('milestones'); A.sfx.open(); }
      else select(null);
    }
    P.down = false; P.panning = false; P.mining = false; P.id = null;
    $('mineRing').classList.add('hidden');
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  root.addEventListener('blur', () => {
    P.down = false; P.panning = false; P.mining = false; P.id = null;
    UI.keys = {};
    $('mineRing').classList.add('hidden');
  });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!UI.S) return;
    const [wx, wy] = R.screenToWorld(e.clientX, e.clientY);
    const dz = e.deltaY > 0 ? .88 : 1.14;
    R.cam.zoom = clamp(R.cam.zoom * dz, .3, 2.6);
    // keep the point under the cursor fixed
    const [wx2, wy2] = R.screenToWorld(e.clientX, e.clientY);
    R.cam.x += wx - wx2; R.cam.y += wy - wy2;
    clampCam();
  }, { passive: false });

  cv.addEventListener('contextmenu', e => e.preventDefault());
}

function clampCam(){
  const S = UI.S;
  if (!S) return;
  R.cam.x = clamp(R.cam.x, 0, S.w);
  R.cam.y = clamp(R.cam.y, 0, S.h);
}

function tileUnder(px, py){
  if (!UI.S) return null;
  const [wx, wy] = R.screenToWorld(px, py);
  const tx = Math.floor(wx), ty = Math.floor(wy);
  if (!F.inMap(UI.S, tx, ty)) return null;
  return [tx, ty];
}

/* place with the active tool at tile (from pointer) */
function placeAt(t, first){
  if (!t || !UI.tool) return;
  const S = UI.S;
  const def = F.BUILDINGS[UI.tool];
  const [gx, gy] = ghostOrigin(t, def);
  const chk = F.canPlace(S, UI.tool, gx, gy, UI.dir);
  if (!chk.ok){
    if (first){
      if (chk.why === 'cost'){ A.sfx.error(); toastCost(def); }
      else if (chk.why !== 'occupied'){ A.sfx.error(); toast(cap(chk.why), 'warn', 2600); }
    }
    return;
  }
  const e = F.place(S, UI.tool, gx, gy, UI.dir, false);
  if (e){
    A.sfx.place();
    if (e.kind === 'belt') tipOnce('firstBelt');
    if (e.kind === 'splitter') tipOnce('firstSplitter');
    if (e.kind === 'pump') tipOnce('firstPipe');
    buildBarAfford();
  }
}

/* drag-lay 1x1 lines (belts, pipes) with auto-rotation; fills gaps */
function dragPlace(px, py){
  const S = UI.S;
  const def = F.BUILDINGS[UI.tool];
  if (!def) return;
  const t = tileUnder(px, py);
  if (!t) return;
  const P = UI.pointer;
  const last = P.lastTile;
  if (!last || (t[0] === last[0] && t[1] === last[1])) return;
  if (def.kind !== 'belt' && def.kind !== 'pipe'){
    P.lastTile = t;   // machines, tunnels, splitters: click to place, no drag-spam
    return;
  }
  // walk axis-major from last to current
  let [cx, cy] = last;
  let guard = 64;
  while ((cx !== t[0] || cy !== t[1]) && guard-- > 0){
    const dx = t[0] - cx, dy = t[1] - cy;
    let d;
    if (Math.abs(dx) >= Math.abs(dy)) d = dx > 0 ? 1 : 3;
    else d = dy > 0 ? 2 : 0;
    // rotate the belt we're leaving to point at the next tile
    if (def.kind === 'belt'){
      const prev = F.entAt(S, cx, cy);
      if (prev && prev.kind === 'belt' && F.BUILDINGS[prev.key] === def) prev.dir = d;
      UI.dir = d;
    }
    cx += DX[d]; cy += DY[d];
    placeAt([cx, cy], false);
  }
  P.lastTile = t;
}

function removeAt(t){
  if (!t) return;
  const e = F.entAt(UI.S, t[0], t[1]);
  if (!e || e.kind === 'core') return;
  if (UI.selection === e) select(null);
  F.remove(UI.S, t[0], t[1]);
  A.sfx.remove();
  buildBarAfford();
}

/* multi-tile ghosts centre on the cursor */
function ghostOrigin(t, def){
  return [t[0] - ((def.w - 1) >> 1), t[1] - ((def.h - 1) >> 1)];
}

/* ==================================================================== */
/* KEYBOARD                                                             */
/* ==================================================================== */
function bindKeys(){
  root.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    UI.keys[e.code] = true;
    if (!UI.started) return;
    switch (e.code){
      case 'KeyR': {
        UI.dir = (UI.dir + 1) & 3;
        if (!UI.tool && UI.selection && UI.selection.kind !== 'core'){
          UI.selection.dir = (UI.selection.dir + 1) & 3;
          refreshSelPanel();
        }
        A.sfx.rotate();
        break;
      }
      case 'KeyQ': {
        const t = UI.hover;
        const ent = t && F.entAt(UI.S, t[0], t[1]);
        if (ent && ent.kind !== 'core' && UI.S.unlocked[ent.key]) setTool(ent.key);
        break;
      }
      case 'KeyE': toggleBig('inventory'); break;
      case 'KeyU': toggleBig('milestones'); break;
      case 'KeyM': A.setOn(!A.on); $('btnSound').style.opacity = A.on ? 1 : .4; break;
      case 'KeyF': R.cam.x = UI.S.core.x + 2; R.cam.y = UI.S.core.y + 2; break;
      case 'Escape':
        if (UI.bigTab) closeBig();
        else if (UI.tool) setTool(null);
        else if (UI.selection) select(null);
        break;
      default: {
        if (e.code.startsWith('Digit')){
          const n = +e.code.slice(5) - 1;
          const list = catBuildings(UI.activeCat);
          if (list[n] && UI.S.unlocked[list[n]]) setTool(list[n]);
        }
      }
    }
  });
  root.addEventListener('keyup', (e) => { UI.keys[e.code] = false; });
}

/* ==================================================================== */
/* HUD BINDINGS                                                         */
/* ==================================================================== */
function bindHud(){
  $('objHead').addEventListener('click', () => {
    $('objCard').classList.toggle('collapsed');
    A.sfx.click();
  });
  $('btnFoundry').addEventListener('click', () => toggleBig('milestones'));
  $('btnInv').addEventListener('click', () => toggleBig('inventory'));
  $('btnSound').addEventListener('click', () => {
    A.init(); A.resume();
    A.setOn(!A.on);
    $('btnSound').style.opacity = A.on ? 1 : .4;
  });
  $('btnMenu').addEventListener('click', () => {
    UI.save();
    toast('Progress saved.', '', 1800);
  });
  $('bigClose').addEventListener('click', closeBig);
  $('bigPanelWrap').addEventListener('pointerdown', (e) => {
    if (e.target === $('bigPanelWrap')) closeBig();
  });
  $('btnFreeplay').addEventListener('click', () => {
    UI.S.freeplay = true;
    R.cine = null;
    $('winOverlay').classList.add('hidden');
    $('winOverlay').classList.remove('solid');
    UI.save();
  });
  // draw the little power bolt
  const pc = $('powerIcon').getContext('2d');
  pc.strokeStyle = 'rgba(0,0,0,0)';
  pc.fillStyle = '#59d6ff';
  pc.beginPath();
  pc.moveTo(15, 3); pc.lineTo(7, 15); pc.lineTo(12, 15);
  pc.lineTo(10, 23); pc.lineTo(19, 11); pc.lineTo(14, 11);
  pc.closePath(); pc.fill();
}

/* ==================================================================== */
/* BUILD BAR                                                            */
/* ==================================================================== */
function catBuildings(cat){
  return F.BUILD_ORDER.filter(k => F.BUILDINGS[k].cat === cat);
}

function buildTabs(){
  const bt = $('buildTabs');
  bt.innerHTML = '';
  for (const c of F.CATS){
    const b = el('button', 'buildTab' + (c.id === UI.activeCat ? ' on' : ''), c.name);
    b.addEventListener('click', () => {
      UI.activeCat = c.id;
      buildTabs(); buildBar();
      A.sfx.click();
    });
    bt.appendChild(b);
  }
}

function buildBar(){
  const bar = $('buildBar');
  bar.innerHTML = '';
  const S = UI.S;
  const list = catBuildings(UI.activeCat);
  list.forEach((key, i) => {
    const def = F.BUILDINGS[key];
    const unlocked = !!S.unlocked[key];
    const b = el('button', 'buildBtn' + (UI.tool === key ? ' on' : '') + (unlocked ? '' : ' locked'));
    b.dataset.key = key;
    const ic = R.makeBuildingIcon(key, 34);
    b.appendChild(el('span', 'bkey', String(i + 1)));
    b.appendChild(ic);
    b.appendChild(el('span', 'bname', def.name));
    b.addEventListener('click', () => {
      if (!S.unlocked[key]){ A.sfx.error(); toast('Locked — reach <b>' + F.MILESTONES[def.unlock].name + '</b>', 'warn', 3000); return; }
      setTool(UI.tool === key ? null : key);
    });
    b.addEventListener('pointerenter', (ev) => showBuildTip(ev, key));
    b.addEventListener('pointerleave', hideTip);
    bar.appendChild(b);
  });
  buildBarAfford();
}

function buildBarAfford(){
  const S = UI.S;
  if (!S) return;
  for (const b of $('buildBar').children){
    const key = b.dataset.key;
    if (!key) continue;
    b.classList.toggle('cant', S.unlocked[key] && !F.canAfford(S, F.BUILDINGS[key].cost));
  }
}

function setTool(key){
  UI.tool = key;
  if (key){
    select(null);
    tipOnce('firstSelect');
    const def = F.BUILDINGS[key];
    if (def.kind === 'belt' || def.kind === 'pipe') { /* keep dir */ }
  }
  for (const b of $('buildBar').children)
    b.classList.toggle('on', b.dataset.key === key);
  A.sfx.click();
}

/* ---------- tooltip ---------- */
function showBuildTip(ev, key){
  const S = UI.S;
  const def = F.BUILDINGS[key];
  const tt = $('tooltip');
  let html = `<div class="tt-name">${def.name}</div><div class="tt-desc">${def.desc}</div>`;
  const stats = [];
  if (def.speed && def.kind === 'belt') stats.push(`${(def.speed).toFixed(1)} tiles/s`);
  if (def.kind === 'miner') stats.push(`${(def.speed / def.mineTime).toFixed(2)} ore/s`);
  if (def.kind === 'machine') stats.push(`${def.speed}× speed`);
  if (def.out) stats.push(`+${def.out} P`);
  if (def.power) stats.push(`${def.power} P draw`);
  if (def.fuel) stats.push('burns coal');
  if (def.span) stats.push(`spans ${def.span} tiles`);
  if (def.cap && def.kind === 'chest') stats.push(`holds ${def.cap}`);
  if (stats.length) html += `<div class="tt-stat">${stats.join(' · ')}</div>`;
  html += '<div class="tt-cost">' + Object.entries(def.cost).map(([k, n]) => {
    const have = F.invCount(S, k);
    return `<span class="${have < n ? 'lack' : ''}">${iconImg(k, 14)} ${n} <span class="have">(${F.fmt(have)})</span></span>`;
  }).join('') + '</div>';
  if (!S.unlocked[key]) html += `<div class="tt-lock">Unlocks at: ${F.MILESTONES[def.unlock] ? F.MILESTONES[def.unlock].name : '—'}</div>`;
  tt.innerHTML = html;
  tt.classList.remove('hidden');
  positionTip(ev.clientX, ev.clientY);
}
function iconImg(item, size){
  const cv = R.itemIcon(item, size * 2);
  return `<img src="${cv.toDataURL()}" width="${size}" height="${size}" style="vertical-align:-2px">`;
}
function positionTip(px, py){
  const tt = $('tooltip');
  const r = tt.getBoundingClientRect();
  let x = px + 14, y = py - r.height - 10;
  if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
  if (y < 8) y = py + 18;
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}
function hideTip(){ $('tooltip').classList.add('hidden'); }

/* ==================================================================== */
/* SELECTION PANEL                                                      */
/* ==================================================================== */
function select(e){
  UI.selection = e;
  const p = $('selPanel');
  if (!e){ p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  refreshSelPanel();
  A.sfx.click();
}

function refreshSelPanel(){
  const e = UI.selection;
  if (!e) return;
  const S = UI.S;
  if (S.ents.indexOf(e) < 0){ select(null); return; }
  const def = F.BUILDINGS[e.key];
  const p = $('selPanel');
  let html = '';
  html += `<div class="selHead"><canvas data-icon="${e.key}" width="44" height="44"></canvas>
    <div><div class="selTitle">${def.name}</div><div class="selSub">${kindLabel(def)}</div></div></div>`;

  if (e.kind === 'miner'){
    const i = F.tileIdx(S, e.x, e.y);
    const t = S.oreType[i];
    const ore = t ? F.ORES[t] : null;
    html += row('Deposit', ore ? `${ore.name} · ${F.fmt(S.oreAmt[i])} left` : '—');
    html += row('Rate', rateStr(e));
    if (def.power) html += row('Power draw', def.power + ' P');
  }
  if (e.kind === 'machine'){
    html += recipeSection(S, e, def);
    html += buffers(e);
    if (def.fam === 'refinery') html += row('Crude tank', `${e.tank.toFixed(0)} / ${def.tank}`);
    html += row('Rate', rateStr(e));
    if (def.power) html += row('Power draw', def.power + ' P');
    if (e.crafting) html += `<div class="progOuter"><div class="progFill" style="width:${(e.prog * 100).toFixed(0)}%"></div></div>`;
  }
  if (e.kind === 'gen' || e.kind === 'turbine'){
    html += row('Output', `${Math.round(F.BUILDINGS[e.key].out * F.powerMul(S))} P`);
    html += row('Load', `${Math.round((e.load || 0) * 100)}%`);
  }
  if (e.kind === 'solar') html += row('Output', `${Math.round(def.out * F.powerMul(S))} P`);
  if (e.kind === 'belt') html += row('Speed', `${(def.speed * F.beltMul(S)).toFixed(2)} tiles/s`);
  if (e.kind === 'ubelt'){
    html += row('Linked', e.linkId ? (e.isExit ? 'exit ✓' : 'entrance ✓') : '<span style="color:var(--accent)">unlinked</span>');
    if (!e.linkId) html += `<div class="ghostNote">Place a matching tunnel within ${def.span} tiles, in the same direction, to link.</div>`;
  }
  if (e.kind === 'chest'){
    const cap = F.CHEST_CAP + F.upRank(S, 'capacitors') * 20;
    html += row('Stored', `${e.total} / ${cap}`);
    html += bufList(e.store);
  }
  if (e.kind === 'pump'){
    html += row('Tank', `${e.tank.toFixed(1)} / 30`);
    html += row('Power draw', def.power + ' P');
  }
  if (e.kind === 'pipe') html += row('Crude', `${e.fluid.toFixed(1)} / ${def.cap}`);

  // fuel
  if (def.fuel || e.kind === 'gen' || e.kind === 'turbine'){
    const isT = e.kind === 'turbine';
    const item = isT ? 'fuelCell' : 'coal';
    const frac = clamp(e.fuelT / (isT ? def.burn : F.COAL_BURN), 0, 1);
    html += `<div class="selDivider"></div><div class="selSection">Fuel</div>
      <div class="bufRow">${iconImg(item, 16)}
        <div class="fuelBarOuter"><div class="fuelBarFill" style="width:${frac * 100}%"></div></div>
        <span class="n">${e.fuelBuf} buffered</span></div>
      <button class="fuelBtn" data-fuel="1" ${F.invCount(S, item) ? '' : 'disabled'}>
        + ${isT ? 'fuel cell' : 'coal'} (${F.fmt(F.invCount(S, item))} held)</button>`;
  }

  html += `<button class="dangerBtn" data-del="1">Remove (full refund)</button>`;
  p.innerHTML = html;

  // wire dynamic bits
  const ic = p.querySelector('canvas[data-icon]');
  if (ic){
    const src = R.makeBuildingIcon(e.key, 44);
    ic.getContext('2d').drawImage(src, 0, 0);
  }
  p.querySelectorAll('[data-recipe]').forEach(b => {
    b.addEventListener('click', () => {
      e.recipe = b.dataset.recipe === '_' ? null : b.dataset.recipe;
      e.crafting = false; e.prog = 0;
      A.sfx.click();
      refreshSelPanel();
    });
  });
  const fb = p.querySelector('[data-fuel]');
  if (fb) fb.addEventListener('click', () => {
    const moved = F.addFuel(S, e, 5);
    if (moved){ A.sfx.click(); refreshSelPanel(); }
    else A.sfx.error();
  });
  p.querySelector('[data-del]').addEventListener('click', () => {
    F.remove(S, e.x, e.y);
    A.sfx.remove();
    select(null);
    buildBarAfford();
  });
}

function kindLabel(def){
  return { belt:'logistics', ubelt:'logistics', splitter:'logistics', chest:'storage', pipe:'fluid',
    miner:'extraction', machine:{smelter:'furnace', alloy:'furnace', asm:'assembler', refinery:'refinery'}[def.fam] || 'machine',
    gen:'power', turbine:'power', solar:'power', pump:'extraction' }[def.kind] || def.kind;
}
function row(k, v){ return `<div class="selRow"><span>${k}</span><b>${v}</b></div>`; }
function rateStr(e){
  return e.ema > 0.001 ? (e.ema * 60).toFixed(1) + ' /min' : '—';
}
function buffers(e){
  let html = '';
  if (Object.keys(e.inBuf).length){
    html += `<div class="selSection">Input</div>` + bufList(e.inBuf);
  }
  if (Object.keys(e.outBuf).length){
    html += `<div class="selSection">Output</div>` + bufList(e.outBuf);
  }
  return html;
}
function bufList(o){
  let h = '';
  for (const k in o){
    if (o[k] <= 0) continue;
    h += `<div class="bufRow">${iconImg(k, 16)} ${F.ITEMS[k] ? F.ITEMS[k].name : k}<span class="n">${Math.floor(o[k])}</span></div>`;
  }
  return h || '<div class="ghostNote">empty</div>';
}

function recipeSection(S, e, def){
  if (def.fam === 'smelter' || def.fam === 'alloy'){
    const opts = F.AUTO_RECIPES[def.fam].filter(k => F.recipeUnlocked(S, k));
    return `<div class="selSection">Smelts automatically</div>
      <div class="compChain">${opts.map(k => `<span>${iconImg(F.RECIPES[k].out, 15)}</span>`).join('')}</div>`;
  }
  const opts = Object.keys(F.RECIPES).filter(k => {
    const r = F.RECIPES[k];
    return r.machine === def.fam && F.recipeUnlocked(S, k);
  });
  let h = `<div class="selSection">Recipe</div><div class="recipeGrid">`;
  for (const k of opts){
    h += `<button class="recipeBtn${e.recipe === k ? ' on' : ''}" data-recipe="${k}" title="${F.ITEMS[F.RECIPES[k].out].name}">${iconImg(F.RECIPES[k].out, 24)}</button>`;
  }
  h += '</div>';
  if (e.recipe){
    const r = F.RECIPES[e.recipe];
    h += `<div class="compChain" style="margin-top:7px">` +
      Object.entries(r.in).map(([k, n]) => `<span>${n}× ${iconImg(k, 14)}</span>`).join(' ') +
      (r.fluid ? `<span>${r.fluid} crude</span>` : '') +
      `<span class="arrow">→</span><span>${r.outN}× ${iconImg(r.out, 14)}</span></div>`;
  } else {
    h += `<div class="ghostNote">Choose what this machine crafts.</div>`;
  }
  return h;
}

/* ==================================================================== */
/* OBJECTIVE CARD                                                       */
/* ==================================================================== */
function refreshObjective(){
  const S = UI.S;
  if (!S) return;
  const ms = F.MILESTONES[S.msIndex];
  if (!ms){
    $('objTier').textContent = '✦';
    $('objName').textContent = 'The Engine turns';
    $('objBody').innerHTML = '<div class="objFlavor">Freeplay — the world is yours to pave.</div>';
    return;
  }
  $('objTier').textContent = 'T' + S.msIndex;
  $('objName').textContent = ms.name;
  const req = ms.req || ms.handMine;
  let html = `<div class="objFlavor">${ms.flavor}</div>`;
  for (const k in req){
    const cur = Math.min(S.msProg[k] || 0, req[k]);
    const done = cur >= req[k];
    html += `<div class="objReq${done ? ' done' : ''}">
      <img src="${R.itemIcon(k, 36).toDataURL()}" width="18" height="18">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between">
          <span class="objReqName">${F.ITEMS[k].name}${ms.handMine ? ' (by hand)' : ''}</span>
          <span class="objReqNum">${cur} / ${req[k]}</span>
        </div>
        <div class="objBarOuter"><div class="objBarFill" style="width:${(cur / req[k] * 100).toFixed(1)}%"></div></div>
      </div></div>`;
  }
  if (ms.hint) html += `<div class="objHint">${ms.hint}</div>`;
  const grants = Object.entries(ms.grant || {});
  const unlockNames = ms.unlocks.filter(u => !u.startsWith('r:')).map(u => F.BUILDINGS[u].name);
  const recipeNames = ms.unlocks.filter(u => u.startsWith('r:')).map(u => F.ITEMS[F.RECIPES[u.slice(2)].out].name);
  if (unlockNames.length || recipeNames.length){
    html += `<div class="objReward">unlocks: ${[...unlockNames, ...recipeNames].join(', ')}</div>`;
  }
  if (grants.length){
    html += `<div class="objReward">reward: ${grants.map(([k, n]) => `${n} ${iconImg(k, 13)}`).join(' ')}</div>`;
  }
  $('objBody').innerHTML = html;
}

/* ==================================================================== */
/* POWER BAR                                                            */
/* ==================================================================== */
function refreshPower(){
  const S = UI.S;
  const st = S.stats;
  const fill = $('powerBarFill');
  if (st.powerSupply <= 0 && st.powerDemand <= 0){
    fill.style.width = '0%';
    $('powerText').textContent = 'no grid';
    return;
  }
  const frac = st.powerSupply > 0 ? clamp(st.powerDemand / st.powerSupply, 0, 1) : 1;
  fill.style.width = (frac * 100).toFixed(0) + '%';
  fill.className = '';
  fill.id = 'powerBarFill';
  if (st.powerRatio < .999) fill.classList.add('brown');
  else if (frac > .8) fill.classList.add('strain');
  $('powerText').textContent = `${Math.round(st.powerDemand)} / ${Math.round(st.powerSupply)} P`;
}

/* ==================================================================== */
/* BIG PANEL                                                            */
/* ==================================================================== */
const BIG_TABS = [
  { id:'inventory', name:'Inventory' },
  { id:'milestones', name:'Milestones' },
  { id:'upgrades', name:'Upgrades' },
  { id:'compendium', name:'Compendium' },
  { id:'stats', name:'Stats' },
];

function toggleBig(tab){
  if (UI.bigTab === tab) closeBig();
  else openBig(tab);
}
function openBig(tab){
  UI.bigTab = tab;
  $('bigPanelWrap').classList.remove('hidden');
  const bt = $('bigTabs');
  bt.innerHTML = '';
  for (const t of BIG_TABS){
    const b = el('button', 'bigTab' + (t.id === tab ? ' on' : ''), t.name);
    b.addEventListener('click', () => openBig(t.id));
    bt.appendChild(b);
  }
  renderBig();
  A.sfx.open();
}
function closeBig(){
  UI.bigTab = null;
  $('bigPanelWrap').classList.add('hidden');
  A.sfx.close();
}

function renderBig(){
  const S = UI.S;
  const body = $('bigBody');
  switch (UI.bigTab){
    case 'inventory': {
      const keys = F.ITEM_ORDER.filter(k => (S.inv[k] || 0) > 0);
      if (!keys.length){ body.innerHTML = '<div class="ghostNote">Nothing yet — mine some ore.</div>'; break; }
      body.innerHTML = '<div class="invGrid">' + keys.map(k =>
        `<div class="invCell"><img src="${R.itemIcon(k, 52).toDataURL()}" width="26" height="26">
         <span class="cnt">${F.fmt(S.inv[k])}</span><span class="nm">${F.ITEMS[k].name}</span></div>`).join('') + '</div>';
      break;
    }
    case 'milestones': {
      let h = '';
      F.MILESTONES.forEach((ms, i) => {
        const state = i < S.msIndex ? 'done' : i === S.msIndex ? 'current' : 'future';
        const req = ms.req || ms.handMine;
        h += `<div class="msRow ${state}">
          <div class="msTier">${i < S.msIndex ? '✓' : 'T' + i}</div>
          <div class="msInfo">
            <div class="msName">${ms.name}</div>`;
        if (state === 'future' && i > S.msIndex){
          h += `<div class="msLocked">…the ash keeps its secrets…</div>`;
        } else {
          h += `<div class="msDesc">${ms.flavor}</div>
            <div class="msReqs">${Object.entries(req).map(([k, n]) =>
              `<span>${iconImg(k, 14)} ${state === 'current' ? Math.min(S.msProg[k] || 0, n) + ' / ' : ''}${n}</span>`).join('')}</div>`;
          const chips = ms.unlocks.map(u => u.startsWith('r:')
            ? F.ITEMS[F.RECIPES[u.slice(2)].out].name
            : F.BUILDINGS[u].name);
          if (chips.length) h += `<div class="msUnlocks">${chips.map(c => `<span class="msChip">${c}</span>`).join('')}</div>`;
        }
        h += '</div></div>';
      });
      body.innerHTML = h;
      break;
    }
    case 'upgrades': {
      let h = '<div class="upGrid">';
      for (const id in F.UPGRADES){
        const up = F.UPGRADES[id];
        const rank = S.upgrades[id] || 0;
        const maxed = rank >= up.max;
        h += `<div class="upCard${maxed ? ' maxed' : ''}">
          <div class="upHead"><span class="upName">${up.name}</span><span class="upRank">${maxed ? 'MAX' : `rank ${rank} / ${up.max}`}</span></div>
          <div class="upDesc">${up.desc}</div>
          <div class="upPips">${Array.from({length: up.max}, (_, i) => `<div class="upPip${i < rank ? ' filled' : ''}"></div>`).join('')}</div>`;
        if (!maxed){
          const cost = up.costs[rank];
          const can = F.canAfford(S, cost);
          h += `<button class="upBuy" data-up="${id}" ${can ? '' : 'disabled'}>` +
            Object.entries(cost).map(([k, n]) =>
              `<span class="${F.invCount(S, k) < n ? 'lack' : ''}">${iconImg(k, 14)} ${n}</span>`).join('') +
            '</button>';
        }
        h += '</div>';
      }
      body.innerHTML = h + '</div>';
      body.querySelectorAll('[data-up]').forEach(b => {
        b.addEventListener('click', () => {
          if (F.buyUpgrade(S, b.dataset.up)){
            A.sfx.buy();
            renderBig();
            buildBarAfford();
          } else A.sfx.error();
        });
      });
      break;
    }
    case 'compendium': {
      let h = '';
      for (const k in F.RECIPES){
        const r = F.RECIPES[k];
        const known = F.recipeUnlocked(S, k);
        const machineName = { smelter:'Furnace', alloy:'Alloy furnace', asm:'Assembler', refinery:'Refinery' }[r.machine];
        if (!known){
          h += `<div class="compRow" style="opacity:.45"><div style="width:26px;text-align:center;color:var(--ink-faint)">?</div>
            <div class="compMid"><div class="compName" style="color:var(--ink-faint)">Undiscovered</div></div></div>`;
          continue;
        }
        h += `<div class="compRow">
          <img src="${R.itemIcon(r.out, 52).toDataURL()}" width="26" height="26">
          <div class="compMid">
            <div class="compName">${F.ITEMS[r.out].name}${r.outN > 1 ? ' ×' + r.outN : ''}</div>
            <div class="compChain">${Object.entries(r.in).map(([ik, n]) => `<span>${n}× ${iconImg(ik, 13)} ${F.ITEMS[ik].name}</span>`).join('<span class="arrow">+</span>')}${r.fluid ? `<span class="arrow">+</span><span>${r.fluid} crude</span>` : ''}</div>
          </div>
          <span class="compMachine">${machineName}</span>
          <span class="compTime">${r.time}s</span>
        </div>`;
      }
      body.innerHTML = h;
      break;
    }
    case 'stats': {
      const st = S.stats;
      // per-minute rates from buckets (last 60s = 12 buckets)
      const win = st.buckets.slice(-12);
      const rates = {};
      for (const b of win) for (const k in b) rates[k] = (rates[k] || 0) + b[k];
      const mins = Math.max(1 / 60, win.length * 5 / 60);
      let h = `<div class="selSection">Production (last ${Math.round(mins * 60)}s)</div><table class="statTable">`;
      const keys = F.ITEM_ORDER.filter(k => rates[k] || st.made[k]);
      if (!keys.length) h += '<tr><td class="ghostNote">No production yet.</td></tr>';
      for (const k of keys){
        h += `<tr><td>${iconImg(k, 15)} ${F.ITEMS[k].name}</td>
          <td>${((rates[k] || 0) / mins).toFixed(1)} /min</td>
          <td>${F.fmt(st.made[k] || 0)} lifetime</td></tr>`;
      }
      h += '</table>';
      h += `<div class="selSection" style="margin-top:14px">World</div><table class="statTable">
        <tr><td>Time</td><td>${F.fmtTime(S.time)}</td></tr>
        <tr><td>Machines placed</td><td>${S.ents.length - 1}</td></tr>
        <tr><td>Delivered to Core</td><td>${F.fmt(Object.values(S.delivered).reduce((a, b) => a + b, 0))}</td></tr>
        <tr><td>Power</td><td>${Math.round(st.powerDemand)} / ${Math.round(st.powerSupply)} P</td></tr>
      </table>`;
      body.innerHTML = h;
      break;
    }
  }
}

/* ==================================================================== */
/* TOASTS + TIPS                                                        */
/* ==================================================================== */
function toast(html, kind, ms){
  const box = $('toasts');
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  const t = el('div', 'toast' + (kind ? ' ' + kind : ''), html);
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('gone');
    setTimeout(() => t.remove(), 400);
  }, ms || 5000);
}
UI.toast = toast;

function tipOnce(id){
  const S = UI.S;
  if (!S || S.flags['tip_' + id]) return;
  S.flags['tip_' + id] = true;
  if (F.TIPS[id]){
    toast(F.TIPS[id], 'tip', 8000);
    A.sfx.tip();
  }
}

function toastCost(def){
  const S = UI.S;
  const lacks = Object.entries(def.cost)
    .filter(([k, n]) => F.invCount(S, k) < n)
    .map(([k, n]) => `${iconImg(k, 13)} ${n - F.invCount(S, k)} more ${F.ITEMS[k].name}`);
  toast('Need ' + lacks.join(', '), 'warn', 3200);
}

function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

/* ==================================================================== */
/* EVENTS from the sim                                                  */
/* ==================================================================== */
function drainEvents(){
  const S = UI.S;
  for (const ev of S.events){
    R.onEvent(S, ev);
    switch (ev.type){
      case 'deliver':
        A.sfx.deliver();
        tipOnce('coreFull');
        break;
      case 'handmine': A.sfx.mineDone(); break;
      case 'craft': break;
      case 'tip': tipOnce(ev.id); break;
      case 'milestone': {
        A.sfx.milestone();
        const next = F.MILESTONES[S.msIndex];
        toast(`<b style="color:var(--accent)">◆ ${ev.name} complete</b>` +
          (next ? `<br>Next: <b>${next.name}</b>` : ''), '', 8000);
        refreshObjective();
        buildBar();
        if (S.msIndex === 3) tipOnce('firstUpgrade');
        UI.save();
        break;
      }
      case 'win': startWin(); break;
    }
  }
  S.events.length = 0;
}

/* ==================================================================== */
/* WIN CINEMATIC                                                        */
/* ==================================================================== */
function startWin(){
  A.sfx.win();
  select(null);
  setTool(null);
  if (UI.bigTab) closeBig();
  UI.cineStage = 0;
  const ov = $('winOverlay');
  ov.classList.remove('hidden');
  const lines = $('winLines');
  const S = UI.S;
  const delivered = Object.values(S.delivered).reduce((a, b) => a + b, 0);
  lines.innerHTML = `
    <div>The World Engine draws its first breath in a thousand years.</div>
    <div>Every belt still turns. Every furnace still burns. It remembers you now.</div>
    <div style="color:var(--ink-dim);font-size:.85em;margin-top:10px">
      ${F.fmtTime(S.time)} · ${F.fmt(delivered)} items delivered · ${S.ents.length - 1} machines</div>`;
  // staged reveal
  setTimeout(() => ov.classList.add('solid'), 6200);
  const ls = lines.children;
  setTimeout(() => ls[0] && ls[0].classList.add('show'), 8000);
  setTimeout(() => ls[1] && ls[1].classList.add('show'), 10200);
  setTimeout(() => ls[2] && ls[2].classList.add('show'), 12200);
  setTimeout(() => $('btnFreeplay').classList.remove('hidden'), 12800);
}

/* ==================================================================== */
/* TUTORIAL ARROW targets                                               */
/* ==================================================================== */
function updateArrow(){
  const S = UI.S;
  UI.arrow = null;
  if (S.msIndex > 1 || S.won) return;
  const ms = F.MILESTONES[S.msIndex];
  if (S.msIndex === 0){
    // point at the nearest needed ore
    const need = Object.keys(ms.handMine).find(k => (S.msProg[k] || 0) < ms.handMine[k]);
    if (!need) return;
    UI.arrow = nearestOre(F.oreTypeByItem[need]);
  } else if (S.msIndex === 1){
    // until a miner exists, point at iron; then at the core if nothing delivered yet
    const hasMiner = S.ents.some(e => e.kind === 'miner');
    if (!hasMiner) UI.arrow = nearestOre(1);
    else if (!Object.keys(S.delivered).length){
      UI.arrow = { x: S.core.x + S.core.w / 2, y: S.core.y };
    }
  }
}
function nearestOre(type){
  const S = UI.S;
  const cx = R.cam.x, cy = R.cam.y;
  let best = null, bd = 1e9;
  // coarse scan
  for (let y = 0; y < S.h; y += 2) for (let x = 0; x < S.w; x += 2){
    const i = y * S.w + x;
    if (S.oreType[i] === type && S.oreAmt[i] > 0 && !S.grid[i]){
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd){ bd = d; best = { x: x + .5, y: y + .5 }; }
    }
  }
  return best;
}

/* ==================================================================== */
/* PER-FRAME UPDATE                                                     */
/* ==================================================================== */
UI.update = function(dt){
  const S = UI.S;
  if (!S) return;
  const P = UI.pointer;

  /* WASD / arrows pan */
  const panSpd = 16 / R.cam.zoom * dt;
  if (UI.keys.KeyW || UI.keys.ArrowUp) R.cam.y -= panSpd;
  if (UI.keys.KeyS || UI.keys.ArrowDown) R.cam.y += panSpd;
  if (UI.keys.KeyA || UI.keys.ArrowLeft) R.cam.x -= panSpd;
  if (UI.keys.KeyD || UI.keys.ArrowRight) R.cam.x += panSpd;
  clampCam();

  /* hover tile from last-known pointer (robust to missing move events) */
  UI.hover = tileUnder(P.x, P.y);

  /* hand mining: hold LMB on ore with no tool */
  if (P.down && P.btn === 0 && !UI.tool && !P.panning && !R.cine){
    const t = UI.hover;
    if (t && P.moved <= 8){
      const i = F.tileIdx(S, t[0], t[1]);
      const ot = S.oreType[i];
      if (ot && ot !== F.OIL_TYPE && S.oreAmt[i] > 0){
        P.mining = true;
        const res = F.handMine(S, t[0], t[1], dt);
        if (res){
          A.sfx.mine();
          const ring = $('mineRing');
          ring.classList.remove('hidden');
          const [sx, sy] = R.worldToScreen(t[0] + .5, t[1] + .5);
          ring.style.left = sx + 'px';
          ring.style.top = sy + 'px';
          ring.querySelector('.fg').style.strokeDashoffset = 113 * (1 - clamp(S.handProg, 0, 1));
        }
      } else if (P.mining){
        P.mining = false;
        $('mineRing').classList.add('hidden');
      }
    }
  } else if (P.mining){
    P.mining = false;
    $('mineRing').classList.add('hidden');
  }

  drainEvents();

  /* throttled HUD refresh */
  UI.uiT += dt;
  if (UI.uiT >= .25){
    UI.uiT = 0;
    refreshObjective();
    refreshPower();
    if (UI.selection) refreshSelPanel();
    buildBarAfford();
    if (UI.bigTab === 'stats' || UI.bigTab === 'inventory') renderBig();
    updateArrow();
  }

  /* audio activity follows the working factory */
  let act = 0;
  for (const e of S.ents){
    if (e.active || e.load > .05) act++;
    if (act > 40) break;
  }
  A.setActivity(act / 40);

  /* autosave */
  UI.autosaveT += dt;
  if (UI.autosaveT > 20){
    UI.autosaveT = 0;
    UI.save();
  }
};

/* view-state for the renderer */
UI.viewState = function(){
  const S = UI.S;
  let ghost = null;
  if (UI.tool && UI.hover && !R.cine){
    const def = F.BUILDINGS[UI.tool];
    const [gx, gy] = ghostOrigin(UI.hover, def);
    const chk = F.canPlace(S, UI.tool, gx, gy, UI.dir);
    ghost = { key: UI.tool, x: gx, y: gy, dir: UI.dir, ok: chk.ok };
  }
  return {
    ghost,
    hover: UI.hover,
    selection: UI.selection,
    arrow: UI.arrow,
    beltPath: null,
  };
};

/* save on tab hide / close */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) UI.save();
});
root.addEventListener('beforeunload', () => UI.save());

})(typeof window !== 'undefined' ? window : globalThis);
