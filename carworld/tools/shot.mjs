import { chromium } from 'playwright-core';
const [,, url, out, w='1280', h='720', wait='__done'] = process.argv;
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
const p = await b.newPage({ viewport:{width:+w,height:+h} });
p.on('console', m=>console.log('[console]', m.text())); p.on('pageerror', e=>console.log('[pageerror]', e.message));
await p.goto(url);
await p.waitForFunction(`window.${wait}===true`, null, {timeout:120000});
console.log(JSON.stringify(await p.evaluate('window.__info||null')));
await p.screenshot({ path: out });
await b.close();
