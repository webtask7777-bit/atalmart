// Crisp element screenshots of the storefront via headless Chrome (CDP).
// The in-app browser pane returns blank captures here, so this drives a real
// Chrome instead. The first-visit pincode modal and PWA prompt are pre-dismissed
// by seeding localStorage before the app loads.
//
//   OUT=/tmp/shots PREFIX=hero node scripts/cdp-shot.mjs <url> '[[390,844],[1280,900]]' '<css selector>' [slides]
//
// `slides` (optional, number): click that many dots of the hero carousel
// ('[aria-label="Choose offer"] button') inside the element and capture each.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.env.OUT || ".cache/shots";
const PREFIX = process.env.PREFIX || "shot";
const [url, sizesJson, selectorArg, slidesArg] = process.argv.slice(2);
const sizes = JSON.parse(sizesJson || "[[390,844]]");
const selector = selectorArg || 'section[aria-roledescription="carousel"]';
const slides = Number(slidesArg || 0);
const port = 9300 + Math.floor(Math.random() * 500);
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  ["--headless=new", "--hide-scrollbars", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "about:blank"],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === "page");
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome did not start");
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const measure = (i) => `(async()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return null;
  ${slides ? `const d=el.querySelectorAll('[aria-label="Choose offer"] button')[${i}]; if(d) d.click();` : ""}
  el.scrollIntoView({block:'start',behavior:'instant'}); window.scrollBy(0,-260);
  await new Promise(r=>setTimeout(r,${slides ? 900 : 1500}));
  await Promise.race([Promise.all([...el.querySelectorAll('img')].map(i=>i.decode().catch(()=>{}))), new Promise(r=>setTimeout(r,4000))]);
  await new Promise(r=>setTimeout(r,600));
  const r=el.getBoundingClientRect();
  return {x:r.x,y:r.y+window.scrollY,w:r.width,h:r.height,imgs:[...el.querySelectorAll('img')].map(i=>i.complete&&i.naturalWidth>0)}})()`;

try {
  ws = new WebSocket(await connect());
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem('atalmart-user-pincode', JSON.stringify({state:{pincode:'492101',area:'Sector 27, Atal Nagar',promptDismissed:true},version:0})); localStorage.setItem('atalmart_pwa_install_dismissed_at', String(Date.now()))}catch{}`,
  });
  for (const [w, h] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: w < 768 });
    await send("Page.navigate", { url });
    // Autoplay ticks every 6.5 s after hydration; capture well before that.
    await sleep(2500);
    for (let i = 0; i < Math.max(1, slides); i++) {
      const { result } = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: measure(i) });
      if (!result.value) {
        console.log(w, "selector not found");
        break;
      }
      const r = result.value;
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(w, r.w + 16), height: r.h + 16, scale: 1 },
        captureBeyondViewport: true,
      });
      const f = join(OUT, `${PREFIX}-${w}${slides ? `-${i + 1}` : ""}.png`);
      writeFileSync(f, Buffer.from(data, "base64"));
      console.log(w, slides ? `slide ${i + 1}` : "", "→", f, Math.round(r.w), "×", Math.round(r.h), "imgs", r.imgs.filter(Boolean).length + "/" + r.imgs.length);
    }
  }
} finally {
  chrome.kill();
}
