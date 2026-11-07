/* geo.js — the spherical plumbing.
 *
 * Everything the game knows about the shape of the Earth lives here: decoding the
 * quantised TopoJSON in world-data.js, projecting lon/lat onto a real orthographic
 * globe (and back again, so a tap becomes a coordinate), great-circle distance, and
 * working out which country a point fell in.
 *
 * No DOM, no canvas — headless.js loads this file directly.
 */
(function (root) {
  'use strict';

  var EARTH_R_KM = 6371.0088;
  var DEG = Math.PI / 180;

  /* ---------------------------------------------------------------- decoding */

  // TopoJSON arcs are stored as quantised deltas; walk them back to lon/lat.
  function decodeArcs(topo) {
    var sx = topo.transform.scale[0], sy = topo.transform.scale[1];
    var tx = topo.transform.translate[0], ty = topo.transform.translate[1];
    var out = new Array(topo.arcs.length);
    for (var i = 0; i < topo.arcs.length; i++) {
      var src = topo.arcs[i], n = src.length;
      var pts = new Float64Array(n * 2);
      var x = 0, y = 0;
      for (var j = 0; j < n; j++) {
        x += src[j][0];
        y += src[j][1];
        pts[j * 2] = x * sx + tx;
        pts[j * 2 + 1] = y * sy + ty;
      }
      out[i] = pts;
    }
    return out;
  }

  // A ring is a list of arc indices; negative means "walk that arc backwards".
  function stitchRing(arcs, idx) {
    var parts = [], total = 0, k;
    for (k = 0; k < idx.length; k++) {
      var i = idx[k], rev = false;
      if (i < 0) { i = ~i; rev = true; }
      var a = arcs[i];
      parts.push({ pts: a, rev: rev });
      total += a.length / 2;
    }
    // Successive arcs repeat the shared endpoint; drop all but the first.
    var ring = new Float64Array((total - (parts.length - 1)) * 2);
    var w = 0;
    for (k = 0; k < parts.length; k++) {
      var p = parts[k].pts, n = p.length / 2, skip = k === 0 ? 0 : 1;
      if (!parts[k].rev) {
        for (var j = skip; j < n; j++) { ring[w++] = p[j * 2]; ring[w++] = p[j * 2 + 1]; }
      } else {
        for (var j2 = n - 1 - skip; j2 >= 0; j2--) { ring[w++] = p[j2 * 2]; ring[w++] = p[j2 * 2 + 1]; }
      }
    }
    return ring;
  }

  function ringBBox(ring) {
    var w = 180, e = -180, s = 90, n = -90;
    for (var i = 0; i < ring.length; i += 2) {
      var x = ring[i], y = ring[i + 1];
      if (x < w) w = x; if (x > e) e = x;
      if (y < s) s = y; if (y > n) n = y;
    }
    return [w, s, e, n];
  }

  // Rings that straddle the ±180 seam come out of Natural Earth as a jump from 179.9
  // to -179.9, which makes a ray cast think Fiji stretches across the Pacific and
  // swallows Bolivia. Walk the ring and let longitude run continuously past 180
  // instead; lookups then test the point at lon, lon±360.
  function unwrapRing(ring) {
    var out = new Float64Array(ring.length);
    var off = 0;
    out[0] = ring[0]; out[1] = ring[1];
    for (var i = 2; i < ring.length; i += 2) {
      var d = ring[i] - ring[i - 2];
      if (d > 180) off -= 360;
      else if (d < -180) off += 360;
      out[i] = ring[i] + off;
      out[i + 1] = ring[i + 1];
    }
    return out;
  }

  // Unit-sphere xyz for every vertex, precomputed once so each frame is just a rotation.
  function ringXYZ(ring) {
    var n = ring.length / 2, xyz = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var lon = ring[i * 2] * DEG, lat = ring[i * 2 + 1] * DEG;
      var cl = Math.cos(lat);
      xyz[i * 3] = cl * Math.cos(lon);
      xyz[i * 3 + 1] = cl * Math.sin(lon);
      xyz[i * 3 + 2] = Math.sin(lat);
    }
    return xyz;
  }

  // Smallest cap containing the ring: centre + angular radius, used to cull rings
  // that are entirely behind the globe or off-screen before touching their points.
  function ringCap(xyz) {
    var n = xyz.length / 3, cx = 0, cy = 0, cz = 0, i;
    for (i = 0; i < n; i++) { cx += xyz[i * 3]; cy += xyz[i * 3 + 1]; cz += xyz[i * 3 + 2]; }
    var len = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
    cx /= len; cy /= len; cz /= len;
    var minDot = 1;
    for (i = 0; i < n; i++) {
      var d = cx * xyz[i * 3] + cy * xyz[i * 3 + 1] + cz * xyz[i * 3 + 2];
      if (d < minDot) minDot = d;
    }
    return { x: cx, y: cy, z: cz, r: Math.acos(Math.max(-1, Math.min(1, minDot))) };
  }

  function buildLand(topo, arcs) {
    var out = [];
    for (var p = 0; p < topo.land.length; p++) {
      var poly = topo.land[p];
      for (var r = 0; r < poly.length; r++) {
        var ring = stitchRing(arcs, poly[r]);
        if (ring.length < 8) continue;              // slivers aren't worth a path
        var xyz = ringXYZ(ring);
        out.push({ ring: ring, xyz: xyz, cap: ringCap(xyz), hole: r > 0 });
      }
    }
    return out;
  }

  function buildCountries(topo, arcs) {
    var out = [];
    for (var c = 0; c < topo.countries.length; c++) {
      var g = topo.countries[c];
      var polyList = g.t === 2 ? g.a : [g.a];
      var polys = [], bbox = [180, 90, -180, -90];
      for (var p = 0; p < polyList.length; p++) {
        var rings = [];
        for (var r = 0; r < polyList[p].length; r++) {
          var ring = stitchRing(arcs, polyList[p][r]);
          if (ring.length < 8) continue;
          ring = unwrapRing(ring);
          rings.push({ pts: ring, bbox: ringBBox(ring) });
        }
        if (!rings.length) continue;
        var bb = rings[0].bbox;
        if (bb[0] < bbox[0]) bbox[0] = bb[0];
        if (bb[1] < bbox[1]) bbox[1] = bb[1];
        if (bb[2] > bbox[2]) bbox[2] = bb[2];
        if (bb[3] > bbox[3]) bbox[3] = bb[3];
        polys.push({ rings: rings, bbox: bb });
      }
      out.push({ name: g.n, polys: polys, bbox: bbox, index: c });
    }
    return out;
  }

  var _world = null;
  function world(topo) {
    if (_world) return _world;
    topo = topo || root.WORLD_TOPO;
    var arcs = decodeArcs(topo);
    _world = { land: buildLand(topo, arcs), countries: buildCountries(topo, arcs) };
    return _world;
  }

  /* ------------------------------------------------------------- projection */

  // A camera is {lon, lat, scale} — where on the globe we're looking and how many
  // pixels one Earth radius covers.
  function basis(cam) {
    var l = cam.lon * DEG, p = cam.lat * DEG;
    var cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
    return {
      view: [cp * cl, cp * sl, sp],          // toward the viewer
      east: [-sl, cl, 0],                     // screen +x
      north: [-sp * cl, -sp * sl, cp]         // screen +y (before the flip)
    };
  }

  function project(lon, lat, cam, cx, cy, b) {
    b = b || basis(cam);
    var rl = lon * DEG, rp = lat * DEG, c = Math.cos(rp);
    var x = c * Math.cos(rl), y = c * Math.sin(rl), z = Math.sin(rp);
    var depth = x * b.view[0] + y * b.view[1] + z * b.view[2];
    return {
      x: cx + cam.scale * (x * b.east[0] + y * b.east[1] + z * b.east[2]),
      y: cy - cam.scale * (x * b.north[0] + y * b.north[1] + z * b.north[2]),
      depth: depth,
      visible: depth > 0
    };
  }

  // Screen point back to a coordinate. Returns null when the tap missed the globe.
  function unproject(sx, sy, cam, cx, cy, b) {
    b = b || basis(cam);
    var u = (sx - cx) / cam.scale, v = -(sy - cy) / cam.scale;
    var q = u * u + v * v;
    if (q > 1) return null;
    var w = Math.sqrt(1 - q);
    var x = u * b.east[0] + v * b.north[0] + w * b.view[0];
    var y = u * b.east[1] + v * b.north[1] + w * b.view[1];
    var z = u * b.east[2] + v * b.north[2] + w * b.view[2];
    return {
      lon: Math.atan2(y, x) / DEG,
      lat: Math.asin(Math.max(-1, Math.min(1, z))) / DEG
    };
  }

  /* --------------------------------------------------------------- geodesy */

  function distanceKm(lon1, lat1, lon2, lat2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG;
    var dp = (lat2 - lat1) * DEG, dl = (lon2 - lon1) * DEG;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function bearing(lon1, lat1, lon2, lat2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / DEG + 360) % 360;
  }

  // Points along the great circle between two coordinates — the reveal arc.
  function greatCircle(lon1, lat1, lon2, lat2, steps) {
    steps = steps || 48;
    var toXYZ = function (lon, lat) {
      var l = lon * DEG, p = lat * DEG, c = Math.cos(p);
      return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
    };
    var a = toXYZ(lon1, lat1), b2 = toXYZ(lon2, lat2);
    var dot = Math.max(-1, Math.min(1, a[0] * b2[0] + a[1] * b2[1] + a[2] * b2[2]));
    var ang = Math.acos(dot), out = [];
    if (ang < 1e-9) return [[lon1, lat1], [lon2, lat2]];
    var s = Math.sin(ang);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var c1 = Math.sin((1 - t) * ang) / s, c2 = Math.sin(t * ang) / s;
      var x = c1 * a[0] + c2 * b2[0], y = c1 * a[1] + c2 * b2[1], z = c1 * a[2] + c2 * b2[2];
      out.push([Math.atan2(y, x) / DEG, Math.asin(Math.max(-1, Math.min(1, z))) / DEG]);
    }
    return out;
  }

  /* ------------------------------------------------------- country lookup */

  function pointInRing(lon, lat, ring) {
    var pts = ring.pts, bb = ring.bbox;
    if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) return false;
    var inside = false, n = pts.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = pts[i * 2], yi = pts[i * 2 + 1];
      var xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > lat) !== (yj > lat) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Ring 0 of a polygon is the outer ring, the rest are holes (Lesotho's bite out of
  // South Africa, the Caspian, and friends). Rings live in unwrapped longitude, so a
  // point is offered at lon and lon±360 and matches whichever copy the ring uses.
  function countryAt(lon, lat, w) {
    w = w || world();
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    var lons = [lon, lon + 360, lon - 360];
    for (var c = 0; c < w.countries.length; c++) {
      var country = w.countries[c];
      for (var p = 0; p < country.polys.length; p++) {
        var rings = country.polys[p].rings;
        for (var k = 0; k < 3; k++) {
          if (!pointInRing(lons[k], lat, rings[0])) continue;
          var inHole = false;
          for (var r = 1; r < rings.length; r++) {
            if (pointInRing(lons[k], lat, rings[r])) { inHole = true; break; }
          }
          if (!inHole) return country.name;
        }
      }
    }
    return null;   // ocean, or a coastline rounding error
  }

  // Walk a given distance along a bearing. Used to probe around a coastal point.
  function destination(lon, lat, bearingDeg, km) {
    var d = km / EARTH_R_KM, br = bearingDeg * DEG;
    var p1 = lat * DEG, l1 = lon * DEG;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
    var l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lon: ((l2 / DEG + 540) % 360) - 180, lat: p2 / DEG };
  }

  // Coastlines at 1:50m cut corners, so a genuinely-in-Nome tap can land in the
  // Bering Sea. If the exact point is ocean, probe outward and take the country
  // that answers most often. Anything past ~40 km really is at sea.
  function countryNear(lon, lat, w, maxKm) {
    w = w || world();
    var exact = countryAt(lon, lat, w);
    if (exact) return exact;
    // The 50m polygons stop short of the pole itself, but everything below 84°S
    // is Antarctic ice sheet and nobody else's.
    if (lat <= -84) return 'Antarctica';
    var rings = [12, 26, maxKm || 40], tally = {}, best = null, bestN = 0;
    for (var r = 0; r < rings.length; r++) {
      for (var b = 0; b < 360; b += 45) {
        var d = destination(lon, lat, b, rings[r]);
        var hit = countryAt(d.lon, d.lat, w);
        if (!hit) continue;
        tally[hit] = (tally[hit] || 0) + 1;
        if (tally[hit] > bestN) { bestN = tally[hit]; best = hit; }
      }
      if (best) return best;   // nearest ring wins outright
    }
    return null;
  }

  var API = {
    EARTH_R_KM: EARTH_R_KM,
    DEG: DEG,
    world: world,
    basis: basis,
    project: project,
    unproject: unproject,
    distanceKm: distanceKm,
    bearing: bearing,
    greatCircle: greatCircle,
    destination: destination,
    countryAt: countryAt,
    countryNear: countryNear,
    _ringBBox: ringBBox
  };

  root.Geo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
