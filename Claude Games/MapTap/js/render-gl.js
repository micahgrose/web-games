/* render-gl.js — the satellite globe.
 *
 * Ray-casts a sphere in the fragment shader: every pixel inside the disc is
 * unprojected back to a lon/lat and sampled straight out of the Blue Marble
 * texture, so the imagery stays sharp at any zoom instead of being warped as
 * geometry. Lighting, limb darkening and the atmosphere are done in the same
 * pass. Pins, the arc and the label are drawn by the 2D overlay canvas on top,
 * reusing the vector renderer's methods so there is one implementation of each.
 *
 * Needs WebGL2 (for textureGrad, which kills the antimeridian seam). Anything
 * older falls back to the vector globe in render.js.
 */
(function (root) {
  'use strict';

  var Geo = root.Geo;

  var VERT = [
    '#version 300 es',
    'in vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 uCenter;',      // globe centre, device px
    'uniform float uRadius;',     // globe radius, device px
    'uniform float uPixel;',      // one CSS px in device px, for edge antialiasing
    'uniform vec3 uEast;',
    'uniform vec3 uNorth;',
    'uniform vec3 uView;',
    'uniform sampler2D uTex;',
    'out vec4 outColor;',
    '',
    'const float PI = 3.141592653589793;',
    'const float TAU = 6.283185307179586;',
    '',
    // Cheap screen-space starfield for the space around the planet.
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    'float stars(vec2 px){',
    '  vec2 cell = floor(px / 7.0);',
    '  float h = hash(cell);',
    '  if (h < 0.976) return 0.0;',
    '  vec2 c = (cell + vec2(hash(cell + 1.3), hash(cell + 7.7))) * 7.0;',
    '  float d = length(px - c);',
    '  float bright = 0.25 + 0.75 * hash(cell + 3.1);',
    '  return bright * smoothstep(1.9, 0.0, d);',
    '}',
    '',
    'void main(){',
    '  vec2 px = gl_FragCoord.xy;',
    '  vec2 d = vec2(px.x - uCenter.x, px.y - uCenter.y) / uRadius;',
    '  float r2 = dot(d, d);',
    '  float aa = uPixel * 1.4 / uRadius;',
    '',
    '  vec3 space = vec3(0.020, 0.027, 0.059);',
    '  float s = stars(px / uPixel);',
    '  vec3 col = space + vec3(0.85, 0.90, 1.0) * s * 0.75;',
    '',
    // Atmosphere: a halo outside the limb, strongest right at the edge.
    '  float glow = exp(-(sqrt(max(r2, 1.0)) - 1.0) * 13.0);',
    '  col += vec3(0.29, 0.52, 0.86) * glow * 0.62;',
    '',
    '  if (r2 < 1.0 + aa) {',
    '    float w = sqrt(max(0.0, 1.0 - r2));',
    '    vec3 dir = normalize(uEast * d.x + uNorth * d.y + uView * w);',
    '    float lon = atan(dir.y, dir.x);',
    '    float lat = asin(clamp(dir.z, -1.0, 1.0));',
    '    vec2 uv = vec2(lon / TAU + 0.5, 0.5 - lat / PI);',
    // Longitude wraps at the seam, which would otherwise make the derivative
    // explode there and select the blurriest mip in a one-pixel stripe.
    '    vec2 ddx = dFdx(uv), ddy = dFdy(uv);',
    '    if (abs(ddx.x) > 0.5) ddx.x -= sign(ddx.x);',
    '    if (abs(ddy.x) > 0.5) ddy.x -= sign(ddy.x);',
    '    vec3 earth = textureGrad(uTex, uv, ddx, ddy).rgb;',
    '',
    // Sunlight from the upper left, plus gentle limb darkening.
    '    vec3 n = vec3(d.x, d.y, w);',
    '    vec3 light = normalize(vec3(-0.38, 0.44, 0.81));',
    '    float lam = max(0.0, dot(n, light));',
    '    earth *= 0.66 + 0.52 * lam;',
    '    earth += vec3(0.16, 0.31, 0.58) * pow(1.0 - w, 3.4) * 0.85;',   // rim haze
    '    earth *= 1.0 - 0.34 * smoothstep(0.55, 1.0, r2);',
    '',
    '    float edge = smoothstep(1.0 + aa, 1.0 - aa, r2);',
    '    col = mix(col, earth, edge);',
    '  }',
    '',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader: ' + log);
    }
    return sh;
  }

  function GlobeGL(canvas, overlay, gl, image) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = overlay.getContext('2d');
    this.gl = gl;
    this.cam = { lon: 10, lat: 20, scale: 300 };
    this.world = Geo.world();
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.cx = 0; this.cy = 0;
    this.markers = [];
    this.arc = null;
    this.label = null;
    this.satellite = true;

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);          // longitude wraps
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);   // latitude does not
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    // Grazing angles near the limb are exactly where anisotropy pays off.
    var aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      var max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    this.tex = tex;

    this.u = {
      center: gl.getUniformLocation(prog, 'uCenter'),
      radius: gl.getUniformLocation(prog, 'uRadius'),
      pixel: gl.getUniformLocation(prog, 'uPixel'),
      east: gl.getUniformLocation(prog, 'uEast'),
      north: gl.getUniformLocation(prog, 'uNorth'),
      view: gl.getUniformLocation(prog, 'uView'),
      tex: gl.getUniformLocation(prog, 'uTex')
    };
    gl.uniform1i(this.u.tex, 0);

    this.resize();
  }

  // Geometry, camera limits and hit testing are identical to the vector globe.
  ['fitScale', 'clampCamera', 'zoomFactor', 'toScreen', 'toGeo',
   '_drawArc', '_drawMarkers', '_drawLabel'].forEach(function (m) {
    GlobeGL.prototype[m] = root.Globe.prototype[m];
  });

  GlobeGL.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    this.cx = this.w / 2;
    this.cy = this.h / 2;

    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.overlay.width = Math.round(this.w * dpr);
    this.overlay.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  GlobeGL.prototype.draw = function () {
    var gl = this.gl, b = Geo.basis(this.cam), dpr = this.dpr;

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // gl_FragCoord has y up from the bottom; the camera works in screen space.
    gl.uniform2f(this.u.center, this.cx * dpr, this.canvas.height - this.cy * dpr);
    gl.uniform1f(this.u.radius, this.cam.scale * dpr);
    gl.uniform1f(this.u.pixel, dpr);
    gl.uniform3f(this.u.east, b.east[0], b.east[1], b.east[2]);
    gl.uniform3f(this.u.north, b.north[0], b.north[1], b.north[2]);
    gl.uniform3f(this.u.view, b.view[0], b.view[1], b.view[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this._drawCoast(ctx, b);
    this._drawArc(ctx, b);
    this._drawMarkers(ctx, b);
    this._drawLabel(ctx, b);
  };

  /* Satellite imagery goes soft long before the zoom limit, so once you are in
   * close the coastline is traced over it — enough to read an edge precisely,
   * faint enough not to look like a border overlay. */
  GlobeGL.prototype._drawCoast = function (ctx, b) {
    var z = this.zoomFactor();
    if (z < 2.2) return;
    var alpha = Math.min(0.5, (z - 2.2) * 0.16);
    var R = this.cam.scale, cx = this.cx, cy = this.cy;
    var land = this.world.land;
    var vx = b.view[0], vy = b.view[1], vz = b.view[2];
    var ex = b.east[0], ey = b.east[1], ez = b.east[2];
    var nx = b.north[0], ny = b.north[1], nz = b.north[2];
    var HALF_PI = Math.PI / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,246,214,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (var r = 0; r < land.length; r++) {
      var ring = land[r], cap = ring.cap;
      var capDot = cap.x * vx + cap.y * vy + cap.z * vz;
      if (Math.acos(Math.max(-1, Math.min(1, capDot))) - cap.r > HALF_PI) continue;
      var capScreenR = Math.sin(Math.min(HALF_PI, cap.r)) * R + 4;
      var capCx = cx + R * (cap.x * ex + cap.y * ey + cap.z * ez);
      var capCy = cy - R * (cap.x * nx + cap.y * ny + cap.z * nz);
      if (capCx + capScreenR < 0 || capCx - capScreenR > this.w ||
        capCy + capScreenR < 0 || capCy - capScreenR > this.h) continue;

      var xyz = ring.xyz, n = xyz.length / 3;
      var spanPx = Math.max(8, Math.sin(Math.min(HALF_PI, cap.r)) * R * 2);
      var stride = Math.max(1, Math.floor(n / Math.max(20, spanPx)));
      var started = false;
      for (var i = 0; i < n; i += stride) {
        var px = xyz[i * 3], py = xyz[i * 3 + 1], pz = xyz[i * 3 + 2];
        if (px * vx + py * vy + pz * vz < 0) { started = false; continue; }
        var X = cx + R * (px * ex + py * ey + pz * ez);
        var Y = cy - R * (px * nx + py * ny + pz * nz);
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  /* Async because the texture has to decode first. Calls back with an instance,
   * or with null if anything at all goes wrong — the caller then uses the
   * vector globe, which needs nothing but a 2D context. */
  GlobeGL.create = function (canvas, overlay, cb) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
    } catch (e) { gl = null; }
    if (!gl) return cb(null, 'no webgl2');
    if (typeof root.EARTH_TEXTURE !== 'string') return cb(null, 'no texture data');

    var img = new root.Image();
    img.onload = function () {
      try {
        cb(new GlobeGL(canvas, overlay, gl, img));
      } catch (e) {
        cb(null, e.message);
      }
    };
    img.onerror = function () { cb(null, 'texture failed to decode'); };
    img.src = root.EARTH_TEXTURE;
  };

  root.GlobeGL = GlobeGL;
})(typeof window !== 'undefined' ? window : globalThis);
