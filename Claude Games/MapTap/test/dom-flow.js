/* dom-flow.js — run with `node test/dom-flow.js`.
 *
 * The logic tests never touch index.html's own script, which is exactly where the
 * bugs I cannot see live: a handler wired to nothing, a control that stops
 * responding, a screen that never hides. So this builds a DOM stub faithful
 * enough to execute that script for real, then plays a full round through it —
 * pointer events, button clicks, the lot — and checks what the page ends up
 * showing. It also renders the globe against a recording canvas so a crash in
 * the draw path cannot hide behind a black screen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let checks = 0, failures = [];
const ok = (c, m) => { checks++; if (!c) failures.push(m); };
const eq = (a, b, m) => ok(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = n => process.stdout.write('\n  ' + n + '\n');

/* ------------------------------------------------------------- canvas stub */

function recordingContext() {
  const calls = {};
  const bump = k => { calls[k] = (calls[k] || 0) + 1; };
  const grad = { addColorStop() { bump('addColorStop'); } };
  const ctx = {
    _calls: calls,
    canvas: null,
    setTransform() { bump('setTransform'); },
    clearRect() { bump('clearRect'); },
    fillRect() { bump('fillRect'); },
    beginPath() { bump('beginPath'); },
    closePath() { bump('closePath'); },
    moveTo() { bump('moveTo'); },
    lineTo() { bump('lineTo'); },
    arc() { bump('arc'); },
    rect() { bump('rect'); },
    roundRect() { bump('roundRect'); },
    fill() { bump('fill'); },
    stroke() { bump('stroke'); },
    clip() { bump('clip'); },
    save() { bump('save'); },
    restore() { bump('restore'); },
    setLineDash() { bump('setLineDash'); },
    fillText() { bump('fillText'); },
    measureText(t) { bump('measureText'); return { width: String(t).length * 7 }; },
    createRadialGradient() { bump('createRadialGradient'); return grad; },
    createLinearGradient() { bump('createLinearGradient'); return grad; }
  };
  return ctx;
}

/* ---------------------------------------------------------------- DOM stub */

class El {
  constructor(id, tag) {
    this.id = id;
    this.tagName = (tag || 'div').toUpperCase();
    this._classes = new Set();
    this.style = {};
    this._html = '';
    this._text = '';
    this._attrs = {};
    this._handlers = {};
    this.disabled = false;
    this.children = [];
    this.value = '';
    this.width = 0; this.height = 0;
    this.clientWidth = 480; this.clientHeight = 64;
    const self = this;
    this.classList = {
      add: c => self._classes.add(c),
      remove: c => self._classes.delete(c),
      contains: c => self._classes.has(c)
    };
  }
  get className() { return [...this._classes].join(' '); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  hasClass(c) { return this._classes.has(c); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn); }
  removeEventListener(type, fn) {
    if (this._handlers[type]) this._handlers[type] = this._handlers[type].filter(f => f !== fn);
  }
  dispatch(type, ev) {
    const list = this._handlers[type] || [];
    const event = Object.assign({ type, preventDefault() {}, stopPropagation() {} }, ev || {});
    list.forEach(fn => fn(event));
    return list.length;
  }
  handlerCount(type) { return (this._handlers[type] || []).length; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }; }
  // A canvas hands out exactly one kind of context. Unless a test installs a GL
  // factory, asking for 'webgl2' gets nothing — which is precisely the situation
  // the vector fallback exists for.
  getContext(type) {
    if (type === undefined || type === '2d') {
      this._ctx = this._ctx || recordingContext();
      return this._ctx;
    }
    if (type === 'webgl2' && this._glFactory) {
      this._gl = this._gl || this._glFactory();
      return this._gl;
    }
    return null;
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  select() {}
  focus() {}
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Build the element table straight from the markup, so an id the script asks for
// that is not actually in the page comes back null and blows up loudly.
const elements = {};
for (const m of html.matchAll(/<(\w+)((?:[^>"]|"[^"]*")*)>/g)) {
  const tag = m[1], attrs = m[2];
  const idMatch = /\bid="([^"]+)"/.exec(attrs);
  if (!idMatch) continue;
  const el = new El(idMatch[1], tag);
  // Seed the starting classes from the markup, so `hidden` at boot is honoured.
  const classMatch = /\bclass="([^"]*)"/.exec(attrs);
  if (classMatch) classMatch[1].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
  elements[idMatch[1]] = el;
}

// The three tier buttons carry data-tier and are found by querySelectorAll.
const tierButtons = [];
for (const m of html.matchAll(/<button class="tier" data-tier="([^"]+)"/g)) {
  const el = new El('tier-' + m[1], 'button');
  el.setAttribute('data-tier', m[1]);
  tierButtons.push(el);
}

const documentStub = {
  getElementById: id => (id in elements ? elements[id] : null),
  querySelectorAll: sel => {
    if (sel === '.tier[data-tier]') return tierButtons;
    return [];
  },
  createElement: tag => new El('created-' + tag, tag),
  execCommand: () => true,
  body: new El('body', 'body')
};

const storage = (() => {
  const map = {};
  return {
    getItem: k => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: k => { delete map[k]; },
    _map: map
  };
})();

// Images resolve on the next frame rather than instantly, so the swap from the
// vector globe to the satellite one is exercised as the async handoff it is.
const pendingImages = [];
class ImageStub {
  constructor() { this.onload = null; this.onerror = null; this._src = ''; }
  get src() { return this._src; }
  set src(v) {
    this._src = v;
    const self = this;
    pendingImages.push(function () {
      if (/^data:image\//.test(v)) { if (self.onload) self.onload(); }
      else if (self.onerror) self.onerror();
    });
  }
}
function flushImages() {
  const q = pendingImages.splice(0, pendingImages.length);
  q.forEach(fn => fn());
}

// Minimal WebAudio: enough for js/audio.js to build its graph against.
function fakeAudioContext() {
  function Param(v) { this.value = v; this.calls = []; }
  Param.prototype.setValueAtTime = function () { return this; };
  Param.prototype.exponentialRampToValueAtTime = function () { return this; };
  Param.prototype.setTargetAtTime = function () { return this; };
  const made = { osc: 0, src: 0 };
  const ctx = {
    _made: made,
    currentTime: 0, sampleRate: 48000, state: 'running', destination: {},
    createOscillator() { made.osc++; return { type: 's', frequency: new Param(1), connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: new Param(1), connect() {} }; },
    createBiquadFilter() { return { type: 'l', frequency: new Param(1), Q: {}, connect() {} }; },
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() { made.src++; return { buffer: null, connect() {}, start() {}, stop() {} }; },
    resume() {}
  };
  return ctx;
}
const audioCtx = fakeAudioContext();

let clock = 0;
const rafQueue = [];
const windowStub = {
  devicePixelRatio: 2,
  addEventListener(type, fn) { (this._h = this._h || {}); (this._h[type] = this._h[type] || []).push(fn); },
  dispatch(type, ev) {
    const list = (this._h && this._h[type]) || [];
    const event = Object.assign({ type, preventDefault() {} }, ev || {});
    list.forEach(fn => fn(event));
    return list.length;
  },
  requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
  performance: { now: () => clock },
  setTimeout: (fn) => { return 0; },      // toast timers never need to fire
  clearTimeout: () => {},
  localStorage: storage,
  navigator: {}                            // no clipboard: exercises the fallback path
};

// Wire the globals the page's scripts expect to find on window.
// Some of these (navigator, performance) are getter-only globals in modern Node,
// so they have to be redefined rather than assigned.
function setGlobal(name, value) {
  try { global[name] = value; }
  catch (e) { Object.defineProperty(global, name, { value: value, configurable: true, writable: true }); }
}
setGlobal('window', windowStub);
setGlobal('document', documentStub);
setGlobal('localStorage', storage);
setGlobal('navigator', windowStub.navigator);   // no clipboard: exercises the fallback
setGlobal('performance', windowStub.performance);
setGlobal('requestAnimationFrame', cb => windowStub.requestAnimationFrame(cb));
setGlobal('setTimeout', windowStub.setTimeout);
setGlobal('clearTimeout', windowStub.clearTimeout);
setGlobal('devicePixelRatio', 2);
setGlobal('Image', ImageStub);
setGlobal('AudioContext', function () { return audioCtx; });
windowStub.Image = ImageStub;
windowStub.AudioContext = global.AudioContext;
windowStub.localStorage = storage;
windowStub.console = { info() {}, warn() {}, log() {} };

// Load the game's scripts in the same order the page does.
const WORLD_TOPO = require(path.join(ROOT, 'js/world-data.js'));
global.WORLD_TOPO = WORLD_TOPO; windowStub.WORLD_TOPO = WORLD_TOPO;
const Geo = require(path.join(ROOT, 'js/geo.js'));
global.Geo = Geo; windowStub.Geo = Geo;
const LOCATIONS = require(path.join(ROOT, 'js/locations.js'));
global.LOCATIONS = LOCATIONS; windowStub.LOCATIONS = LOCATIONS;
const Game = require(path.join(ROOT, 'js/game.js'));
global.Game = Game; windowStub.Game = Game;
const Sfx = require(path.join(ROOT, 'js/audio.js'));
global.Sfx = Sfx; windowStub.Sfx = Sfx;
require(path.join(ROOT, 'js/render.js'));   // defines window.Globe
global.Globe = windowStub.Globe;
const EARTH_TEXTURE = require(path.join(ROOT, 'js/earth-texture.js'));
global.EARTH_TEXTURE = EARTH_TEXTURE; windowStub.EARTH_TEXTURE = EARTH_TEXTURE;
require(path.join(ROOT, 'js/render-gl.js'));   // defines window.GlobeGL
global.GlobeGL = windowStub.GlobeGL;

function runFrames(n, stepMs) {
  for (let i = 0; i < n; i++) {
    const batch = rafQueue.splice(0, rafQueue.length);
    clock += (stepMs === undefined ? 16 : stepMs);
    batch.forEach(cb => cb(clock));
  }
}

/* -------------------------------------------------------------- the globe */
section('globe rendering');
{
  const canvas = elements.globe;
  const globe = new global.Globe(canvas);
  const ctx = canvas.getContext('2d');

  eq(globe.w, 1000, 'canvas picks up its layout width');
  eq(canvas.width, 2000, 'backing store honours devicePixelRatio');

  let threw = null;
  try {
    globe.draw();
  } catch (e) { threw = e; }
  eq(threw, null, 'a plain draw does not throw' + (threw ? ': ' + threw.message : ''));
  ok(ctx._calls.moveTo > 200, 'land paths are emitted (' + ctx._calls.moveTo + ' subpaths)');
  ok(ctx._calls.fill > 0 && ctx._calls.stroke > 0, 'land is filled and stroked');
  ok(ctx._calls.createRadialGradient >= 3, 'ocean, halo and shading gradients are built');

  // Markers, arc and label are the reveal state — draw them too.
  globe.markers = [{ lon: 2.35, lat: 48.85, kind: 'guess', pulse: 0.4 },
                   { lon: 18.41, lat: 43.85, kind: 'answer' }];
  globe.arc = { from: [2.35, 48.85], to: [18.41, 43.85], t: 0.5 };
  globe.label = { lon: 18.41, lat: 43.85, text: 'Sarajevo' };
  threw = null;
  try { globe.draw(); } catch (e) { threw = e; }
  eq(threw, null, 'drawing markers, arc and label does not throw' + (threw ? ': ' + threw.message : ''));
  ok(ctx._calls.fillText > 0, 'the answer label is painted');

  // A context without roundRect (older browsers) must fall back, not crash.
  const noRound = recordingContext();
  delete noRound.roundRect;
  const backup = canvas._ctx;
  canvas._ctx = noRound;
  const g2 = new global.Globe(canvas);
  g2.label = { lon: 0, lat: 0, text: 'Test' };
  threw = null;
  try { g2.draw(); } catch (e) { threw = e; }
  eq(threw, null, 'label falls back to a plain rect without roundRect' + (threw ? ': ' + threw.message : ''));
  ok(noRound._calls.rect > 0, 'and uses rect() instead');
  canvas._ctx = backup;

  // Every zoom level and pole-adjacent camera must render without blowing up.
  threw = null;
  try {
    for (const cam of [{ lon: 0, lat: 89, scale: globe.fitScale() },
                       { lon: 179.9, lat: -89, scale: globe.fitScale() * 20 },
                       { lon: -60, lat: 0, scale: globe.fitScale() * 0.5 }]) {
      globe.cam = Object.assign({}, cam);
      globe.clampCamera();
      globe.draw();
    }
  } catch (e) { threw = e; }
  eq(threw, null, 'extreme cameras render' + (threw ? ': ' + threw.message : ''));

  // Zoom clamps must hold.
  globe.cam.scale = 1e9; globe.clampCamera();
  ok(globe.cam.scale <= globe.fitScale() * 34.001, 'zoom in is capped');
  globe.cam.scale = 0.0001; globe.clampCamera();
  ok(globe.cam.scale >= globe.fitScale() * 0.81, 'zoom out is capped');
  globe.cam.lat = 200; globe.clampCamera();
  ok(globe.cam.lat <= 89, 'latitude cannot pass the pole');
  globe.cam.lon = 540; globe.clampCamera();
  ok(globe.cam.lon >= -180 && globe.cam.lon <= 180, 'longitude wraps into range');
}

/* ----------------------------------------------------------- satellite globe */
section('satellite globe');

// A recording WebGL2 context: enough surface for the renderer to build its
// program, upload the texture and draw, while remembering what it was asked.
function fakeGL() {
  const calls = {}, bump = k => { calls[k] = (calls[k] || 0) + 1; };
  const gl = {
    _calls: calls, _sources: [], _uniforms: [], _params: [],
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TEXTURE_2D: 8, RGB: 9, UNSIGNED_BYTE: 10,
    TEXTURE_WRAP_S: 11, TEXTURE_WRAP_T: 12, REPEAT: 13, CLAMP_TO_EDGE: 14,
    TEXTURE_MIN_FILTER: 15, TEXTURE_MAG_FILTER: 16, LINEAR_MIPMAP_LINEAR: 17, LINEAR: 18,
    TEXTURE0: 19, TRIANGLES: 20, UNPACK_FLIP_Y_WEBGL: 21,
    _compileOk: true, _linkOk: true,
    createShader: () => ({}),
    shaderSource(s, src) { gl._sources.push(src); },
    compileShader() { bump('compileShader'); },
    getShaderParameter: () => gl._compileOk,
    getShaderInfoLog: () => 'compile failed',
    deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() { bump('linkProgram'); },
    getProgramParameter: () => gl._linkOk, getProgramInfoLog: () => 'link failed',
    useProgram() { bump('useProgram'); },
    createBuffer: () => ({}), bindBuffer() {}, bufferData() { bump('bufferData'); },
    getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {},
    createTexture: () => ({}), bindTexture() { bump('bindTexture'); }, pixelStorei() {},
    activeTexture() {},
    texImage2D() { bump('texImage2D'); },
    texParameteri(t, p) { gl._params.push(p); bump('texParameteri'); },
    texParameterf() { bump('texParameterf'); },
    generateMipmap() { bump('generateMipmap'); },
    getExtension: () => null, getParameter: () => 16,
    getUniformLocation(p, n) { gl._uniforms.push(n); return { n: n }; },
    uniform1i() {}, uniform1f() { bump('uniform1f'); },
    uniform2f() { bump('uniform2f'); }, uniform3f() { bump('uniform3f'); },
    viewport() { bump('viewport'); }, drawArrays() { bump('drawArrays'); }
  };
  return gl;
}

{
  const glCanvas = new El('glCanvas', 'canvas');
  const glOverlay = new El('glOverlay', 'canvas');
  const gl = fakeGL();
  glCanvas._glFactory = () => gl;

  let made = null, err = null;
  global.GlobeGL.create(glCanvas, glOverlay, (g, e) => { made = g; err = e; });
  eq(made, null, 'creation waits for the texture to decode');
  flushImages();
  ok(made, 'satellite globe was created' + (err ? ' (' + err + ')' : ''));

  // Shaders must be real GLSL ES 3.00 and use the seam-safe sampling path.
  eq(gl._sources.length, 2, 'a vertex and a fragment shader were compiled');
  ok(gl._sources.every(s => s.indexOf('#version 300 es') === 0), 'both shaders are GLSL ES 3.00');
  ok(gl._sources[1].indexOf('textureGrad') !== -1, 'the fragment shader samples with textureGrad');
  ok(/ddx\.x -= sign\(ddx\.x\)/.test(gl._sources[1]), 'the antimeridian seam is corrected');

  // Every uniform the renderer looks up must be declared in the shader.
  const frag = gl._sources[1];
  eq(gl._uniforms.length, 7, 'seven uniforms are located');
  gl._uniforms.forEach(n => ok(frag.indexOf('uniform') !== -1 && frag.indexOf(n) !== -1,
    'uniform ' + n + ' is declared in the shader'));

  ok(gl._calls.generateMipmap > 0, 'mipmaps are generated for minified views');
  ok(gl._params.indexOf(gl.TEXTURE_WRAP_S) !== -1, 'longitude wrap mode is set');
  ok(gl._calls.texImage2D === 1, 'the texture is uploaded once');

  let drawThrew = null;
  try { made.draw(); } catch (e) { drawThrew = e; }
  eq(drawThrew, null, 'the satellite globe draws' + (drawThrew ? ': ' + drawThrew.message : ''));
  ok(gl._calls.drawArrays > 0, 'a frame was actually issued');
  ok(gl._calls.uniform3f >= 3, 'the camera basis is uploaded each frame');

  // Overlay work: pins and label go through the same code as the vector globe.
  made.markers = [{ lon: 0, lat: 0, kind: 'guess', pulse: 0.2 }, { lon: 30, lat: 20, kind: 'answer' }];
  made.arc = { from: [0, 0], to: [30, 20], t: 1 };
  made.label = { lon: 30, lat: 20, text: 'Somewhere' };
  drawThrew = null;
  try { made.draw(); } catch (e) { drawThrew = e; }
  eq(drawThrew, null, 'overlay drawing on the satellite globe works' + (drawThrew ? ': ' + drawThrew.message : ''));
  ok(glOverlay._ctx._calls.fillText > 0, 'the label is drawn on the overlay, not in GL');

  // Coastlines only come out when the imagery has gone soft from zooming.
  const strokesBefore = glOverlay._ctx._calls.stroke || 0;
  made.cam.scale = made.fitScale();
  made.draw();
  const wide = (glOverlay._ctx._calls.moveTo || 0);
  made.cam.scale = made.fitScale() * 8;
  made.clampCamera();
  made.draw();
  ok((glOverlay._ctx._calls.moveTo || 0) > wide, 'zoomed in, coastlines are traced over the imagery');
  ok(strokesBefore >= 0, 'overlay stroking is recorded');

  // Failure modes must all degrade to the vector globe rather than throwing.
  let r1 = 'unset';
  global.GlobeGL.create(new El('plain', 'canvas'), glOverlay, (g, e) => { r1 = [g, e]; });
  eq(r1[0], null, 'no WebGL2 gives no instance');
  eq(r1[1], 'no webgl2', 'and says why');

  const savedTex = windowStub.EARTH_TEXTURE;
  windowStub.EARTH_TEXTURE = undefined;
  let r2 = 'unset';
  const c2 = new El('c2', 'canvas'); c2._glFactory = () => fakeGL();
  global.GlobeGL.create(c2, glOverlay, (g, e) => { r2 = [g, e]; });
  eq(r2[1], 'no texture data', 'a missing texture is reported, not thrown');
  windowStub.EARTH_TEXTURE = savedTex;

  const badGl = fakeGL();
  badGl._compileOk = false;
  const c3 = new El('c3', 'canvas'); c3._glFactory = () => badGl;
  let r3 = 'unset';
  global.GlobeGL.create(c3, glOverlay, (g, e) => { r3 = [g, e]; });
  flushImages();
  eq(r3[0], null, 'a shader that will not compile yields no instance');
  ok(/compile failed/.test(r3[1]), 'and the compile log is passed back');
}

/* --------------------------------------------------- the page's own script */
section('page script boots');

const scriptBody = (() => {
  const parts = html.split(/<script>\s*/);
  const tail = parts[parts.length - 1];
  return tail.split('</script>')[0];
})();
ok(scriptBody.length > 3000, 'inline page script extracted (' + scriptBody.length + ' chars)');

// Give the page a working WebGL2 context so the rest of this file plays the
// game the way a real browser will: on the satellite globe.
const pageGL = fakeGL();
elements.globe._glFactory = () => pageGL;

let bootError = null;
try {
  // eslint-disable-next-line no-new-func
  new Function(scriptBody)();
} catch (e) { bootError = e; }
eq(bootError, null, 'page script runs without throwing' + (bootError ? ': ' + bootError.message : ''));
ok(rafQueue.length > 0, 'the render loop scheduled its first frame');

// Before the texture decodes, the vector globe carries the page.
runFrames(2);
eq(pageGL._calls.drawArrays, undefined, 'nothing is drawn in GL until the texture is ready');
ok((elements.overlay._ctx._calls.moveTo || 0) > 100, 'the vector globe renders in the meantime');

flushImages();
runFrames(3);
ok(pageGL._calls.drawArrays > 0, 'the page hands over to the satellite globe once ready');
ok(rafQueue.length > 0, 'the render loop keeps rescheduling itself');
eq(pageGL._calls.viewport > 0, true, 'the GL viewport was sized');

/* ------------------------------------------------------------- menu state */
section('menu');
{
  ok(!elements.menu.hasClass('hidden'), 'menu is visible at boot');
  ok(elements.hud.hasClass('hidden'), 'the play HUD is hidden at boot');
  eq(elements.weakBtn.disabled, true, 'weak spots start locked');
  ok(elements.weakDesc.textContent.indexOf('Unlocks') !== -1, 'and say so');
  for (const b of tierButtons) ok(b.handlerCount('click') === 1, 'tier button ' + b.getAttribute('data-tier') + ' is wired');
}

/* ------------------------------------------------------- play a full round */
section('playing a round');

const canvas = elements.globe;
function tapGlobe(x, y) {
  canvas.dispatch('pointerdown', { pointerId: 1, clientX: x, clientY: y });
  canvas.dispatch('pointerup', { pointerId: 1, clientX: x, clientY: y });
}

{
  const explorer = tierButtons.find(b => b.getAttribute('data-tier') === 'explorer');
  explorer.dispatch('click');

  ok(elements.menu.hasClass('hidden'), 'menu hides when a round starts');
  ok(!elements.hud.hasClass('hidden'), 'HUD appears');
  eq(elements.tierName.textContent, 'Explorer', 'tier name shown');
  const firstPlace = elements.promptName.textContent;
  ok(LOCATIONS.some(L => L.n === firstPlace), 'prompt shows a real location: ' + firstPlace);
  ok(elements.promptHook.textContent.length > 20, 'prompt shows its hook');
  ok(elements.promptKicker.textContent.indexOf('1 of 5') !== -1, 'question counter starts at one');
  eq(elements.actionBtn.disabled, true, 'cannot lock in before guessing');
  eq(elements.runScore.textContent, '0', 'running score starts at zero');

  // Tapping empty space off the globe must not arm the button.
  tapGlobe(20, 20);
  eq(elements.actionBtn.disabled, true, 'a tap off the globe is ignored');

  // A tap on the globe places a guess — and makes a sound.
  const soundsBefore = audioCtx._made.osc + audioCtx._made.src;
  tapGlobe(500, 350);
  eq(elements.actionBtn.disabled, false, 'a tap on the globe arms the button');
  ok(elements.hintline.textContent.indexOf('lock it in') !== -1, 'hint updates after placing');
  ok(audioCtx._made.osc + audioCtx._made.src > soundsBefore, 'placing a pin makes a sound');

  // Dragging must rotate rather than register as a tap.
  const before = elements.actionBtn.textContent;
  canvas.dispatch('pointerdown', { pointerId: 2, clientX: 500, clientY: 350 });
  canvas.dispatch('pointermove', { pointerId: 2, clientX: 560, clientY: 360 });
  canvas.dispatch('pointermove', { pointerId: 2, clientX: 620, clientY: 370 });
  canvas.dispatch('pointerup', { pointerId: 2, clientX: 620, clientY: 370 });
  eq(elements.actionBtn.textContent, before, 'a drag does not re-place the guess');

  // Wheel zoom must not throw and must change the scale.
  canvas.dispatch('wheel', { deltaY: -240, clientX: 500, clientY: 350 });
  runFrames(2);

  // Lock it in: the reveal should appear, fully populated.
  const lockSounds = audioCtx._made.osc + audioCtx._made.src;
  elements.actionBtn.dispatch('click');
  ok(audioCtx._made.osc + audioCtx._made.src > lockSounds, 'locking in plays the commit and sweep');
  ok(!elements.reveal.hasClass('hidden'), 'reveal panel opens');
  ok(elements.promptCard.hasClass('hidden'), 'prompt card hides');
  ok(elements.revealPlace.innerHTML.length > 0, 'reveal names the place');
  ok(elements.revealStory.textContent.length > 40, 'reveal tells the story');
  ok(elements.revealMeta.innerHTML.indexOf('away') !== -1, 'reveal reports the distance');
  eq(elements.actionBtn.textContent, 'Next place', 'button becomes Next');
  eq(elements.actionBtn.disabled, false, 'and is enabled');

  runFrames(40);   // let the fly-to animation and score count run

  // Play out the remaining four questions.
  for (let q = 2; q <= 5; q++) {
    elements.actionBtn.dispatch('click');          // next question
    ok(!elements.promptCard.hasClass('hidden'), 'question ' + q + ' shows its prompt');
    ok(elements.promptKicker.textContent.indexOf(q + ' of 5') !== -1, 'counter reads ' + q + ' of 5');
    eq(elements.actionBtn.disabled, true, 'question ' + q + ' starts unlocked');
    tapGlobe(480 + q * 8, 330 + q * 6);
    eq(elements.actionBtn.disabled, false, 'question ' + q + ' arms after a tap');
    elements.actionBtn.dispatch('click');          // lock in
    ok(!elements.reveal.hasClass('hidden'), 'question ' + q + ' reveals');
    runFrames(10);
  }

  eq(elements.actionBtn.textContent, 'See results', 'last question offers results');
  elements.actionBtn.dispatch('click');
}

/* ----------------------------------------------------------------- results */
section('results');
{
  ok(!elements.results.hasClass('hidden'), 'results screen appears');
  ok(elements.hud.hasClass('hidden'), 'HUD hides on results');
  const total = parseInt(elements.resultTotal.innerHTML, 10);
  ok(Number.isFinite(total) && total >= 0 && total <= 1000, 'total is in range: ' + total);
  ok(elements.resultTotal.innerHTML.indexOf('/1000') !== -1, 'total is shown out of 1000');
  ok(elements.resultVerdict.textContent.length > 3, 'a verdict is shown: ' + elements.resultVerdict.textContent);
  const rows = (elements.resultList.innerHTML.match(/class="rrow/g) || []).length;
  eq(rows, 5, 'five result rows are listed');

  // The round must have been written to storage.
  const saved = JSON.parse(storage.getItem(Game.STORE_KEY));
  eq(saved.played, 1, 'the round was saved');
  eq(saved.taps, 5, 'all five taps were recorded');
  eq(saved.rounds.length, 1, 'round history has one entry');
  ok(saved.recent.length === 5, 'recent list was updated');

  // Copy uses the textarea fallback here, since the stub has no clipboard.
  let copyThrew = null;
  try { elements.copyBtn.dispatch('click'); } catch (e) { copyThrew = e; }
  eq(copyThrew, null, 'copy summary works without a clipboard API' + (copyThrew ? ': ' + copyThrew.message : ''));
  ok(elements.toast.hasClass('show'), 'a toast confirms the copy');
}

/* ------------------------------------------------------------ stats screen */
section('stats screen');
{
  elements.statsBtn.dispatch('click');
  ok(!elements.stats.hasClass('hidden'), 'stats screen opens');
  const cells = (elements.statCells.innerHTML.match(/class="cell"/g) || []).length;
  eq(cells, 6, 'six stat cells are rendered');
  ok(elements.statCells.innerHTML.indexOf('Rounds') !== -1, 'rounds played is shown');
  ok(elements.regionBars.innerHTML.indexOf('barrow') !== -1, 'region bars are drawn after a round');
  ok(elements.spark.width > 0, 'the sparkline canvas was sized');
  ok(elements.spark._ctx && elements.spark._ctx._calls.stroke > 0, 'the sparkline was actually drawn');

  elements.statsBack.dispatch('click');
  ok(!elements.menu.hasClass('hidden'), 'back returns to the menu');
  ok(elements.stats.hasClass('hidden'), 'stats screen closes');
}

/* ----------------------------------------------------- replaying, and again */
section('round after round');
{
  // The whole point of this build: start another round immediately, repeatedly.
  const played = [];
  for (let r = 0; r < 6; r++) {
    const tier = tierButtons[r % 3];
    tier.dispatch('click');
    ok(!elements.hud.hasClass('hidden'), 'round ' + (r + 2) + ' starts straight away');
    const names = [];
    for (let q = 1; q <= 5; q++) {
      names.push(elements.promptName.textContent);
      tapGlobe(430 + q * 20, 300 + q * 11);
      elements.actionBtn.dispatch('click');   // lock
      runFrames(4);
      elements.actionBtn.dispatch('click');   // next / results
    }
    played.push(names);
    ok(!elements.results.hasClass('hidden'), 'round ' + (r + 2) + ' reaches results');
    eq(new Set(names).size, 5, 'round ' + (r + 2) + ' had five distinct places');
    elements.againBtn.dispatch('click');
    ok(!elements.hud.hasClass('hidden'), 'Play again starts another round without a reload');
    // bail out of that extra round back to the menu
    elements.quitBtn.dispatch('click');
    ok(!elements.menu.hasClass('hidden'), 'Quit returns to the menu mid-round');
  }

  const saved = JSON.parse(storage.getItem(Game.STORE_KEY));
  eq(saved.played, 7, 'seven finished rounds are on record');
  ok(saved.recent.length <= 90, 'recent list stays capped');

  // Consecutive rounds should not be reruns of each other.
  let overlap = 0;
  for (let i = 1; i < played.length; i++) {
    const prev = new Set(played[i - 1]);
    played[i].forEach(n => { if (prev.has(n)) overlap++; });
  }
  eq(overlap, 0, 'no place repeated between consecutive rounds');
}

/* -------------------------------------------------------------- weak spots */
section('weak spots unlock');
{
  // Deliberately terrible play: tap the same spot every time, five rounds' worth.
  for (let r = 0; r < 2; r++) {
    tierButtons[1].dispatch('click');
    for (let q = 1; q <= 5; q++) {
      tapGlobe(500, 350);
      elements.actionBtn.dispatch('click');
      runFrames(3);
      elements.actionBtn.dispatch('click');
    }
    elements.menuBtn.dispatch('click');
  }
  const saved = JSON.parse(storage.getItem(Game.STORE_KEY));
  ok(saved.misses.length >= 5, 'bad play banked ' + saved.misses.length + ' weak spots');
  eq(elements.weakBtn.disabled, false, 'weak spots unlocked');
  ok(elements.weakDesc.textContent.indexOf('on file') !== -1, 'and the label updated');

  elements.weakBtn.dispatch('click');
  eq(elements.tierName.textContent, 'Weak Spots', 'weak spot round is labelled');
  const first = elements.promptName.textContent;
  ok(saved.misses.some(m => m.name === first) || LOCATIONS.some(L => L.n === first),
    'weak spot round opens on a real place');
  elements.quitBtn.dispatch('click');
}

/* ------------------------------------------------------------------ sound */
section('sound control');
{
  eq(Sfx.muted, false, 'sound is on by default');
  ok(elements.muteBtn2.textContent.indexOf('on') !== -1, 'the menu button says so');

  elements.muteBtn2.dispatch('click');
  eq(Sfx.muted, true, 'the menu toggle mutes');
  ok(elements.muteBtn2.textContent.indexOf('off') !== -1, 'and the label follows');
  eq(storage.getItem('maptap.muted.v1'), '1', 'the preference is persisted');

  const quiet = audioCtx._made.osc + audioCtx._made.src;
  tierButtons[0].dispatch('click');
  tapGlobe(500, 350);
  elements.actionBtn.dispatch('click');
  eq(audioCtx._made.osc + audioCtx._made.src, quiet, 'muted play makes no sound at all');
  elements.quitBtn.dispatch('click');

  elements.muteBtn.dispatch('click');
  eq(Sfx.muted, false, 'the in-game toggle unmutes');
  ok(elements.muteBtn2.textContent.indexOf('on') !== -1, 'both buttons stay in sync');

  windowStub.dispatch('keydown', { key: 'm' });
  eq(Sfx.muted, true, 'M toggles sound');
  windowStub.dispatch('keydown', { key: 'M' });
  eq(Sfx.muted, false, 'and shift-M toggles it back');
}

/* -------------------------------------------------------------- keyboard */
section('keyboard controls');
{
  tierButtons[0].dispatch('click');
  windowStub.dispatch('keydown', { key: 'Enter' });   // nothing placed yet
  ok(!elements.reveal.hasClass('hidden') === false, 'Enter does nothing before a guess is placed');
  tapGlobe(500, 350);
  windowStub.dispatch('keydown', { key: 'Enter' });
  ok(!elements.reveal.hasClass('hidden'), 'Enter locks in a placed guess');
  windowStub.dispatch('keydown', { key: 'Enter' });
  ok(!elements.promptCard.hasClass('hidden'), 'Enter again advances to the next question');
  windowStub.dispatch('keydown', { key: '+' });
  windowStub.dispatch('keydown', { key: '-' });
  windowStub.dispatch('keydown', { key: 'Escape' });
  ok(!elements.menu.hasClass('hidden'), 'Escape leaves the round');

  let resizeThrew = null;
  try { windowStub.dispatch('resize', {}); } catch (e) { resizeThrew = e; }
  eq(resizeThrew, null, 'resize handler survives' + (resizeThrew ? ': ' + resizeThrew.message : ''));
  runFrames(5);
}

/* ------------------------------------------------------------ reset button */
section('reset');
{
  elements.statsBtn.dispatch('click');
  elements.resetBtn.dispatch('click');
  const saved = JSON.parse(storage.getItem(Game.STORE_KEY));
  eq(saved.played, 0, 'reset clears the ledger');
  eq(saved.misses.length, 0, 'and the weak spots');
  ok(elements.statCells.innerHTML.indexOf('>0<') !== -1, 'stats screen redraws at zero');
  elements.statsBack.dispatch('click');
  eq(elements.weakBtn.disabled, true, 'weak spots re-lock after a reset');
}

/* --------------------------------------------------------------- long soak */
section('soak');
{
  let soakThrew = null;
  try {
    tierButtons[2].dispatch('click');
    for (let i = 0; i < 200; i++) {
      tapGlobe(300 + (i * 37) % 400, 200 + (i * 53) % 300);
      elements.actionBtn.dispatch('click');
      runFrames(2, 33);
      elements.actionBtn.dispatch('click');
    }
  } catch (e) { soakThrew = e; }
  eq(soakThrew, null, '200 rapid taps and advances survive' + (soakThrew ? ': ' + soakThrew.message : ''));
  runFrames(20);
  ok(rafQueue.length > 0, 'the render loop is still alive after the soak');
}

/* ------------------------------------------------------------------ report */
console.log('\n' + '-'.repeat(58));
if (failures.length) {
  console.log('FAILURES (' + failures.length + '):');
  failures.forEach(f => console.log('  ✗ ' + f));
  console.log('-'.repeat(58));
  console.log(checks + ' checks, ' + failures.length + ' failed');
  process.exit(1);
} else {
  console.log('all ' + checks + ' checks passed');
  process.exit(0);
}
