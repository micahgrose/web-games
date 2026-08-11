'use strict';

// ── Open the table to the internet ─────────────────────
//   npm run host
//
// Starts the game and a Cloudflare quick tunnel together, waits for the
// public address, and prints it where you can actually see it. Quick
// tunnels need no Cloudflare account and no DNS: cloudflared dials out
// to Cloudflare, so nothing has to be opened on your router and your
// home IP is never handed to the people playing.
//
// The address is thrown away when you stop this — a new one is issued
// every run. That is the deal with quick tunnels; Cloudflare says as
// much, and they are not meant to stay up.
//
// Ctrl-C stops both halves.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// The MSI puts cloudflared on the machine PATH, but a shell opened
// before the install will not have picked it up yet.
const FALLBACKS = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
];
const cloudflaredPath = () => FALLBACKS.find(p => fs.existsSync(p)) || 'cloudflared';

const children = [];
let stopping = false;

function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
    setTimeout(() => process.exit(code), 250);
}
process.on('SIGINT', () => { console.log('\nclosing the table…'); stop(0); });
process.on('SIGTERM', () => stop(0));

// ── The game ───────────────────────────────────────────
// The tunnel is the thing worth protecting: a quick tunnel's address is
// issued once and thrown away when cloudflared exits, so restarting the
// pair to pick up a code change hands everybody a new link. The server
// is a child that can come and go underneath it instead — press r to
// restart it, and it comes back by itself if it falls over. Same URL
// throughout, for as long as this process lives.
let server = null;
let restarts = 0;

function startServer(why) {
    server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: ROOT,
        // stdin stays with us, so 'r' reaches this process and not the game.
        stdio: ['ignore', 'inherit', 'inherit'],
        env: process.env,
    });
    children.push(server);
    if (why) console.log(`\n─── ${why} — the address is unchanged ───\n`);

    server.on('exit', (code) => {
        if (stopping) return;
        children.splice(children.indexOf(server), 1);
        if (code === 0) { console.log('\nthe game exited cleanly.'); return startServer('restarted'); }
        if (++restarts > 5) {
            console.error(`\nthe game keeps failing (code ${code}); giving up.`);
            return stop(code ?? 1);
        }
        console.error(`\nthe game stopped (code ${code}) — restarting it, ${6 - restarts} tries left`);
        setTimeout(() => startServer(null), 700);
    });
}
startServer(null);

// r + Enter restarts the game and leaves the tunnel alone.
if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
        if (!/^r/i.test(key.trim())) return;
        restarts = 0;
        console.log('restarting the game…');
        if (server && !server.killed) server.kill();   // the exit handler brings it back
        else startServer('restarted');
    });
    process.stdin.resume();
}

// ── The tunnel ─────────────────────────────────────────
const exe = cloudflaredPath();
const tunnel = spawn(exe, [
    'tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`,
], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(tunnel);

tunnel.on('error', (err) => {
    console.error(
        err.code === 'ENOENT'
            ? `\ncloudflared not found. Install it with:\n`
              + `  winget install --id Cloudflare.cloudflared\n`
              + `then open a NEW terminal so it lands on your PATH.\n`
            : `\ncloudflared failed: ${err.message}\n`);
    stop(1);
});

let announced = false;
const watch = (buf) => {
    const text = buf.toString();
    const hit = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
    if (hit && !announced) {
        announced = true;
        const url = hit[0];
        const line = '─'.repeat(url.length + 8);
        console.log(
            `\n┌${line}┐\n`
            + `│    ${url}    │\n`
            + `└${line}┘\n`
            + `   Send that to your players. It works from any network.\n`
            + `   Press r + Enter to restart the game on this same address.\n`
            + `   Ctrl-C stops both, and the next run gets a new address.\n`);
    }
    // Real problems still deserve to be seen; the rest is noise.
    if (/ERR|error|failed/i.test(text) && !/level=info/i.test(text)) process.stderr.write(text);
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);

console.log(`starting the table on :${PORT} and opening a tunnel…`);
