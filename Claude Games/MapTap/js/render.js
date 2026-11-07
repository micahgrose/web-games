/* render.js — the globe.
 *
 * Orthographic projection of a real sphere onto a 2D canvas: land rings are
 * pre-converted to unit vectors once, then every frame is a rotation, a dot
 * product for visibility, and a path. Rings entirely behind the planet are
 * culled by their bounding cap before a single point is touched.
 */
(function (root) {
  'use strict';

  var Geo = root.Geo;

  var PALETTE = {
    space: '#05070f',
    oceanLit: '#1d5480',
    oceanMid: '#12395c',
    oceanDeep: '#061a2e',
    land: '#e6d6ad',
    landLow: '#c2b184',
    coast: 'rgba(46,35,18,0.34)',
    atmosphere: 'rgba(122,190,255,0.5)',
    guess: '#ffc857',
    answer: '#4ce0b3',
    arc: 'rgba(255,255,255,0.72)'
  };

  function Globe(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { lon: 10, lat: 20, scale: 300 };
    this.world = Geo.world();
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.cx = 0; this.cy = 0;
    this.stars = this._makeStars(220);
    this.markers = [];      // { lon, lat, kind }
    this.arc = null;        // { from:[lon,lat], to:[lon,lat], t:0..1 }
    this.label = null;      // { lon, lat, text }
    this.resize();
  }

  Globe.prototype._makeStars = function (n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.1 + 0.25,
        a: Math.random() * 0.5 + 0.18
      });
    }
    return out;
  };

  Globe.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
  };

  // The scale at which the whole globe just fits the shorter screen dimension.
  Globe.prototype.fitScale = function () {
    return Math.min(this.w, this.h) * 0.42;
  };

  Globe.prototype.clampCamera = function () {
    var c = this.cam;
    if (c.lat > 89) c.lat = 89;
    if (c.lat < -89) c.lat = -89;
    c.lon = ((c.lon + 180) % 360 + 360) % 360 - 180;
    var min = this.fitScale() * 0.82, max = this.fitScale() * 34;
    if (c.scale < min) c.scale = min;
    if (c.scale > max) c.scale = max;
  };

  Globe.prototype.zoomFactor = function () {
    return this.cam.scale / this.fitScale();
  };

  Globe.prototype.toScreen = function (lon, lat, b) {
    return Geo.project(lon, lat, this.cam, this.cx, this.cy, b);
  };

  Globe.prototype.toGeo = function (sx, sy) {
    return Geo.unproject(sx, sy, this.cam, this.cx, this.cy);
  };

  /* ------------------------------------------------------------------ draw */

  Globe.prototype.draw = function () {
    var ctx = this.ctx, R = this.cam.scale, cx = this.cx, cy = this.cy;
    var b = Geo.basis(this.cam);

    ctx.clearRect(0, 0, this.w, this.h);
    this._drawSpace(ctx);

    // Atmosphere: a soft halo sitting just outside the disc.
    var halo = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.16);
    halo.addColorStop(0, PALETTE.atmosphere);
    halo.addColorStop(0.45, 'rgba(96,160,235,0.14)');
    halo.addColorStop(1, 'rgba(70,130,210,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
    ctx.fill();

    // Ocean. The light sits up and to the left, so the gradient is offset.
    var sea = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.34, R * 0.06, cx, cy, R);
    sea.addColorStop(0, PALETTE.oceanLit);
    sea.addColorStop(0.55, PALETTE.oceanMid);
    sea.addColorStop(1, PALETTE.oceanDeep);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = sea;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    this._drawLand(ctx, b, R);

    // One shading pass over land and sea together, so they read as one ball.
    var shade = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.32, R * 0.1, cx, cy, R * 1.02);
    shade.addColorStop(0, 'rgba(255,246,220,0.16)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0)');
    shade.addColorStop(0.82, 'rgba(2,8,20,0.30)');
    shade.addColorStop(1, 'rgba(0,4,12,0.62)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    this._drawArc(ctx, b);
    this._drawMarkers(ctx, b);

    ctx.restore();

    // Crisp edge on top of everything.
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,205,255,0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();

    this._drawLabel(ctx, b);
  };

  Globe.prototype._drawSpace = function (ctx) {
    ctx.fillStyle = PALETTE.space;
    ctx.fillRect(0, 0, this.w, this.h);
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#dfe9ff';
      ctx.beginPath();
      ctx.arc(s.x * this.w, s.y * this.h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  Globe.prototype._drawLand = function (ctx, b, R) {
    var land = this.world.land, cx = this.cx, cy = this.cy;
    var vx = b.view[0], vy = b.view[1], vz = b.view[2];
    var ex = b.east[0], ey = b.east[1], ez = b.east[2];
    var nx = b.north[0], ny = b.north[1], nz = b.north[2];
    var HALF_PI = Math.PI / 2;

    var grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    grad.addColorStop(0, PALETTE.land);
    grad.addColorStop(1, PALETTE.landLow);
    ctx.fillStyle = grad;
    ctx.strokeStyle = PALETTE.coast;
    ctx.lineWidth = Math.min(1.1, 0.45 + this.zoomFactor() * 0.12);
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (var r = 0; r < land.length; r++) {
      var ring = land[r], cap = ring.cap;

      // Cull: is any part of this ring on the near side at all?
      var capDot = cap.x * vx + cap.y * vy + cap.z * vz;
      var capAng = Math.acos(Math.max(-1, Math.min(1, capDot)));
      if (capAng - cap.r > HALF_PI) continue;

      // Cull: is its screen circle anywhere near the viewport?
      var capScreenR = Math.sin(Math.min(HALF_PI, cap.r)) * R + 4;
      var capCx = cx + R * (cap.x * ex + cap.y * ey + cap.z * ez);
      var capCy = cy - R * (cap.x * nx + cap.y * ny + cap.z * nz);
      if (capCx + capScreenR < 0 || capCx - capScreenR > this.w ||
        capCy + capScreenR < 0 || capCy - capScreenR > this.h) continue;

      var xyz = ring.xyz, n = xyz.length / 3;
      // Thin out points that would land on top of each other anyway.
      var spanPx = Math.max(8, Math.sin(Math.min(HALF_PI, cap.r)) * R * 2);
      var stride = Math.max(1, Math.floor(n / Math.max(20, spanPx)));

      var started = false;
      for (var i = 0; i < n; i += stride) {
        var px = xyz[i * 3], py = xyz[i * 3 + 1], pz = xyz[i * 3 + 2];
        var depth = px * vx + py * vy + pz * vz;
        var sx = px * ex + py * ey + pz * ez;
        var sy = px * nx + py * ny + pz * nz;
        if (depth < 0) {
          // Behind the horizon: pin it to the limb so the outline follows the edge.
          var len = Math.sqrt(sx * sx + sy * sy) || 1;
          sx /= len; sy /= len;
        }
        var X = cx + R * sx, Y = cy - R * sy;
        if (!started) { ctx.moveTo(X, Y); started = true; }
        else ctx.lineTo(X, Y);
      }
      if (started) ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
  };

  Globe.prototype._drawArc = function (ctx, b) {
    if (!this.arc) return;
    var a = this.arc;
    var pts = Geo.greatCircle(a.from[0], a.from[1], a.to[0], a.to[1], 64);
    var upto = Math.max(2, Math.round(pts.length * (a.t === undefined ? 1 : a.t)));

    ctx.save();
    ctx.strokeStyle = PALETTE.arc;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.shadowColor = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    var drawing = false;
    for (var i = 0; i < upto; i++) {
      var p = this.toScreen(pts[i][0], pts[i][1], b);
      if (!p.visible) { drawing = false; continue; }   // break the line at the horizon
      if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  };

  Globe.prototype._drawMarkers = function (ctx, b) {
    for (var i = 0; i < this.markers.length; i++) {
      var m = this.markers[i];
      var p = this.toScreen(m.lon, m.lat, b);
      if (!p.visible) continue;
      var col = m.kind === 'answer' ? PALETTE.answer : PALETTE.guess;

      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;

      if (m.kind === 'answer') {
        // Target rings, so the true spot reads instantly.
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill();
      } else {
        if (m.pulse) {
          ctx.globalAlpha = Math.max(0, 1 - m.pulse);
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 6 + m.pulse * 26, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(10,10,14,0.85)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  Globe.prototype._drawLabel = function (ctx, b) {
    if (!this.label) return;
    var p = this.toScreen(this.label.lon, this.label.lat, b);
    if (!p.visible) return;
    var text = this.label.text;
    ctx.save();
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    var wpx = ctx.measureText(text).width;
    var x = p.x + 16, y = p.y - 14;
    if (x + wpx + 14 > this.w) x = p.x - wpx - 30;
    if (y < 20) y = p.y + 26;
    ctx.fillStyle = 'rgba(6,10,18,0.82)';
    ctx.strokeStyle = 'rgba(76,224,179,0.5)';
    ctx.lineWidth = 1;
    var pad = 7, h = 22;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - pad, y - h + 6, wpx + pad * 2, h, 5);
    else ctx.rect(x - pad, y - h + 6, wpx + pad * 2, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9f6ff';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  };

  root.Globe = Globe;
  root.GLOBE_PALETTE = PALETTE;
})(typeof window !== 'undefined' ? window : globalThis);
