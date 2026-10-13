// Lädt das Spiel in Chromium (Software-GL), führt optional Schritte aus und speichert einen Screenshot.
// Aufruf: node tools/shot.mjs <url> <ausgabe.png> [breite] [höhe] [js-ausdruck vor dem Foto] [wartezeit ms]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const [,, url, out, w = '1280', h = '720', script = '', wait = '1500'] = process.argv;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url);
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
if (script) await page.evaluate(script);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game; return g && { mode: g.mode, p: { x: +g.player.x.toFixed(2), y: +g.player.y.toFixed(2), z: +g.player.z.toFixed(2), m: g.player.mode }, crystals: g.state.crystals.size }; })));
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
await browser.close();
