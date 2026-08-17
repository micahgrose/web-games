/* tiles.js — streaming zoom detail from NASA GIBS.
 *
 * The embedded Blue Marble is 4096 px around the equator, about 9.8 km per
 * pixel, which runs out of detail long before the zoom limit does. GIBS serves
 * the same imagery as WMTS tiles down to 489 m per pixel, with permissive CORS,
 * so once you zoom past the embedded texture's resolution the visible region is
 * fetched at a matching level, composited into one canvas, and handed to the
 * shader as a second texture covering a known lon/lat rectangle.
 *
 * Everything here degrades to nothing: no network, a 404, a slow link or the
 * toggle switched off all just leave the embedded texture on screen.
 *
 * The tile-matrix maths is kept free of the DOM and the network so the harness
 * can check level selection and tile coverage directly.
 */
(function (root) {
  'use strict';

  var ENDPOINT = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/' +
    'BlueMarble_NextGeneration/default/500m/';

  /* GIBS EPSG:4326 "500m" tile matrix set. Tiles are 512 px and square in
   * degrees, so a tile spans 360/cols degrees each way. Levels 0–2 are coarser
   * than the texture already embedded in the page, so they are never used. */
  var TILE_PX = 512;
  var LEVELS = [
    { z: 3, cols: 10, rows: 5 },
    { z: 4, cols: 20, rows: 10 },
    { z: 5, cols: 40, rows: 20 },
    { z: 6, cols: 80, rows: 40 },
    { z: 7, cols: 160, rows: 80 }
  ];
  LEVELS.forEach(function (L) {
    L.span = 360 / L.cols;              // degrees covered by one tile, each way
    L.degPerPx = L.span / TILE_PX;      // ground resolution of the level
  });

  // Resolution of the embedded texture; there is no point streaming coarser.
  var BASE_DEG_PER_PX = 360 / 4096;
  var MAX_TILES = 16;                   // one composite is at most 4x4 tiles

  /* How much ground one screen pixel covers, in degrees, for an orthographic
   * globe of the given radius. Independent of latitude, unlike raw longitude. */
  function degreesPerPixel(scale, minDim) {
    var half = Math.min(1, (minDim / 2) / scale);
    return (2 * Math.asin(half) * 180 / Math.PI) / minDim;
  }

  // The lon/lat box the viewport is currently showing, with longitude widened
  // by latitude because meridians converge.
  function viewRect(cam, w, h) {
    var ax = Math.asin(Math.min(1, (w / 2) / cam.scale)) * 180 / Math.PI;
    var ay = Math.asin(Math.min(1, (h / 2) / cam.scale)) * 180 / Math.PI;
    var latMin = Math.max(-90, cam.lat - ay);
    var latMax = Math.min(90, cam.lat + ay);
    var widest = Math.max(Math.abs(latMin), Math.abs(latMax));
    var lonHalf = Math.min(180, ax / Math.max(0.08, Math.cos(widest * Math.PI / 180)));
    return { lonC: cam.lon, latC: cam.lat, lonHalf: lonHalf, latMin: latMin, latMax: latMax };
  }

  // Finest level that is not wasted on the current zoom, or null if the
  // embedded texture is already good enough.
  function pickLevel(degPerPx) {
    if (degPerPx >= BASE_DEG_PER_PX) return null;
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].degPerPx <= degPerPx) return LEVELS[i];
    }
    return LEVELS[LEVELS.length - 1];
  }

  /* Which tiles cover the view at a level, and the exact lon/lat rectangle the
   * resulting composite spans. Steps down a level rather than fetching more
   * than MAX_TILES images. Longitude is kept unwrapped so a grid crossing the
   * antimeridian stays contiguous; the shader wraps it back. */
  function coverage(rect, level) {
    var idx = LEVELS.indexOf(level);
    for (; idx >= 0; idx--) {
      var L = LEVELS[idx];
      var col0 = Math.floor((rect.lonC - rect.lonHalf + 180) / L.span);
      var col1 = Math.floor((rect.lonC + rect.lonHalf + 180) / L.span);
      var row0 = Math.floor((90 - rect.latMax) / L.span);
      var row1 = Math.floor((90 - rect.latMin) / L.span);
      row0 = Math.max(0, Math.min(L.rows - 1, row0));
      row1 = Math.max(0, Math.min(L.rows - 1, row1));
      var cols = col1 - col0 + 1, rows = row1 - row0 + 1;
      if (cols >= L.cols) { col0 = 0; cols = L.cols; }      // whole way round
      if (cols * rows <= MAX_TILES) {
        var tiles = [];
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var col = ((col0 + c) % L.cols + L.cols) % L.cols;
            tiles.push({ z: L.z, row: row0 + r, col: col, gx: c, gy: r });
          }
        }
        return {
          level: L, tiles: tiles, cols: cols, rows: rows,
          lonMin: col0 * L.span - 180,
          latMax: 90 - row0 * L.span,
          lonSpan: cols * L.span,
          latSpan: rows * L.span,
          key: L.z + ':' + col0 + ':' + row0 + ':' + cols + 'x' + rows
        };
      }
    }
    return null;
  }

  function tileUrl(z, row, col) { return ENDPOINT + z + '/' + row + '/' + col + '.jpeg'; }

  /* ------------------------------------------------------------- the stream */

  function TileStream(opts) {
    opts = opts || {};
    this.enabled = opts.enabled !== false;
    this.cache = {};            // url -> Image (loaded only)
    this.cacheOrder = [];
    this.cacheMax = opts.cacheMax || 220;
    this.pending = 0;
    this.failures = 0;
    this.disabledByFailure = false;
    this.currentKey = null;
    this.canvas = null;
    this.rect = null;           // [lonMin, latMax, lonSpan, latSpan]
    this.version = 0;           // bumped whenever the composite changes
    this.onchange = opts.onchange || function () {};
    this.onstatus = opts.onstatus || function () {};
    this.requests = 0;          // counted for the tests
  }

  TileStream.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!on) {
      this.currentKey = null;
      this.rect = null;
      this.version++;
      this.onchange(this);
    }
    return this.enabled;
  };

  TileStream.prototype._remember = function (url, img) {
    this.cache[url] = img;
    this.cacheOrder.push(url);
    while (this.cacheOrder.length > this.cacheMax) {
      delete this.cache[this.cacheOrder.shift()];
    }
  };

  /* Ask for whatever the camera is looking at. Cheap and idempotent: if the
   * same tile grid is already composited, it returns immediately. */
  TileStream.prototype.update = function (cam, w, h) {
    if (!this.enabled || this.disabledByFailure) return false;
    var dpp = degreesPerPixel(cam.scale, Math.min(w, h));
    var level = pickLevel(dpp);
    if (!level) {
      if (this.currentKey) {          // zoomed back out; drop back to the base
        this.currentKey = null;
        this.rect = null;
        this.version++;
        this.onchange(this);
      }
      return false;
    }
    var cover = coverage(viewRect(cam, w, h), level);
    if (!cover || cover.key === this.currentKey) return false;

    this.currentKey = cover.key;
    this._fetch(cover);
    return true;
  };

  TileStream.prototype._fetch = function (cover) {
    var self = this;
    var needed = cover.tiles.length, done = 0, ok = 0;
    var images = new Array(needed);

    this.onstatus({ loading: true });

    cover.tiles.forEach(function (t, i) {
      var url = tileUrl(t.z, t.row, t.col);
      var cached = self.cache[url];
      if (cached) {
        images[i] = cached;
        ok++; done++;
        if (done === needed) self._composite(cover, images, ok);
        return;
      }
      self.pending++;
      self.requests++;
      var img = new root.Image();
      img.crossOrigin = 'anonymous';    // required, or WebGL cannot use it
      img.onload = function () {
        self.pending--;
        self.failures = 0;
        self._remember(url, img);
        images[i] = img;
        ok++; done++;
        if (done === needed) self._composite(cover, images, ok);
      };
      img.onerror = function () {
        self.pending--;
        self.failures++;
        done++;
        // Offline, or the service is unhappy. Stop pestering it.
        if (self.failures >= 6 && !self.disabledByFailure) {
          self.disabledByFailure = true;
          self.currentKey = null;
          self.onstatus({ loading: false, unavailable: true });
        }
        if (done === needed) self._composite(cover, images, ok);
      };
      img.src = url;
    });
  };

  TileStream.prototype._composite = function (cover, images, ok) {
    this.onstatus({ loading: false });
    // A grid with holes in it would show as black squares over the ocean.
    if (!ok || ok < images.length) {
      if (this.currentKey === cover.key) this.currentKey = null;
      return;
    }
    var W = cover.cols * TILE_PX, H = cover.rows * TILE_PX;
    if (!this.canvas) this.canvas = root.document.createElement('canvas');
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    var ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < cover.tiles.length; i++) {
      var t = cover.tiles[i];
      if (images[i]) ctx.drawImage(images[i], t.gx * TILE_PX, t.gy * TILE_PX, TILE_PX, TILE_PX);
    }
    this.rect = [cover.lonMin, cover.latMax, cover.lonSpan, cover.latSpan];
    this.version++;
    this.onchange(this);
  };

  var API = {
    ENDPOINT: ENDPOINT,
    TILE_PX: TILE_PX,
    LEVELS: LEVELS,
    BASE_DEG_PER_PX: BASE_DEG_PER_PX,
    MAX_TILES: MAX_TILES,
    degreesPerPixel: degreesPerPixel,
    viewRect: viewRect,
    pickLevel: pickLevel,
    coverage: coverage,
    tileUrl: tileUrl,
    TileStream: TileStream
  };

  root.Tiles = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
