# tiles-live.ps1 — the one check that needs the internet.
#
# The offline suite proves the tile maths is self-consistent, but self-consistent
# maths can still address the wrong tile: a row/col off by one returns a
# perfectly valid 512x512 JPEG of somewhere else entirely. So this asks the game
# which tile it would fetch for a handful of unmistakable places, fetches it from
# NASA GIBS for real, and checks the average colour is what that part of the
# world actually looks like.
#
#   powershell -File test/tiles-live.ps1

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP 'maptap-tiles-live'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# lon, lat, and what the imagery there must look like
$places = @(
  @{ name = 'Sahara';    lon = 10;   lat = 25;  test = { param($r,$g,$b) $r -gt 140 -and $r -gt $g -and $g -gt $b }; want = 'sand: r>g>b, bright' }
  @{ name = 'Pacific';   lon = -140; lat = 0;   test = { param($r,$g,$b) $b -gt $r -and $r -lt 60 };                 want = 'deep ocean: blue, dark' }
  @{ name = 'Greenland'; lon = -42;  lat = 72;  test = { param($r,$g,$b) $r -gt 170 -and $g -gt 170 -and $b -gt 170 }; want = 'ice: bright and neutral' }
  @{ name = 'Amazon';    lon = -60;  lat = -3;  test = { param($r,$g,$b) $g -gt $r -and $g -gt $b };                 want = 'rainforest: green dominant' }
  @{ name = 'Australia'; lon = 134;  lat = -25; test = { param($r,$g,$b) $r -gt $g -and $g -gt $b -and $r -gt 100 };  want = 'red centre' }
)

$failures = 0
foreach ($p in $places) {
  # Ask the game itself which tile it would request from this camera.
  $js = @"
var T = require('$($root.Replace('\','/'))/js/tiles.js');
var cam = { lon: $($p.lon), lat: $($p.lat), scale: 800 * 0.42 * 16 };
var L = T.pickLevel(T.degreesPerPixel(cam.scale, 800));
var col = Math.floor((cam.lon + 180) / L.span), row = Math.floor((90 - cam.lat) / L.span);
console.log(T.tileUrl(L.z, row, col));
"@
  $url = (& node -e $js).Trim()
  $file = Join-Path $tmp "$($p.name).jpg"
  try {
    Invoke-WebRequest -Uri $url -OutFile $file -TimeoutSec 45 | Out-Null
  } catch {
    "  FAIL {0,-10} could not fetch: {1}" -f $p.name, $_.Exception.Message
    $failures++
    continue
  }

  $img = New-Object System.Drawing.Bitmap($file)
  if ($img.Width -ne 512 -or $img.Height -ne 512) {
    "  FAIL {0,-10} expected a 512x512 tile, got {1}x{2}" -f $p.name, $img.Width, $img.Height
    $failures++
    $img.Dispose()
    continue
  }
  $r = 0; $g = 0; $b = 0; $n = 0
  for ($y = 32; $y -lt 512; $y += 64) {
    for ($x = 32; $x -lt 512; $x += 64) {
      $px = $img.GetPixel($x, $y); $r += $px.R; $g += $px.G; $b += $px.B; $n++
    }
  }
  $img.Dispose()
  $r = [int]($r / $n); $g = [int]($g / $n); $b = [int]($b / $n)

  if (& $p.test $r $g $b) {
    "  ok   {0,-10} rgb({1,3},{2,3},{3,3})  {4}" -f $p.name, $r, $g, $b, $p.want
  } else {
    "  FAIL {0,-10} rgb({1,3},{2,3},{3,3})  expected {4}" -f $p.name, $r, $g, $b, $p.want
    "       {0}" -f $url
    $failures++
  }
}

""
if ($failures -gt 0) {
  "$failures of $($places.Count) tiles did not look like where they claim to be."
  exit 1
} else {
  "all $($places.Count) live tiles match the ground truth"
  exit 0
}
