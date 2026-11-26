// Launch Chrome, attach over CDP, inject the Vegga test wallet into every page and record signing requests.
// Kane CLI attaches to the same Chrome with --cdp-endpoint; Chrome allows several CDP clients at once.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome(explicit) {
  const c = [explicit, process.env.KANE_CLI_CHROME_PATH, process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  return c.find((p) => p && existsSync(p)) || null;
}

export class Cdp {
  static async connect(url) {
    const c = new Cdp(); c.id = 0; c.pending = new Map(); c.handlers = {};
    c.ws = new WebSocket(url);
    await new Promise((res, rej) => { c.ws.onopen = res; c.ws.onerror = () => rej(new Error('CDP connection failed')); });
    c.ws.onmessage = (m) => c.#onMessage(JSON.parse(m.data));
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej, method }); this.ws.send(JSON.stringify(msg)); });
  }
  on(method, fn) { (this.handlers[method] ||= []).push(fn); }
  #onMessage(m) {
    if (m.id) {
      const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id);
      m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result);
    } else (this.handlers[m.method] || []).forEach((h) => h(m.params, m.sessionId));
  }
  close() { try { this.ws.close(); } catch {} }
}

export async function launchChrome({ chrome, port = 9333, headless = false, extraArgs = [] }) {
  const exe = findChrome(chrome);
  if (!exe) throw new Error('Chrome not found. Install Google Chrome or pass --chrome <path> (or set KANE_CLI_CHROME_PATH).');
  const userDataDir = await mkdtemp(join(tmpdir(), 'vegga-chrome-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,900', '--disable-extensions', ...(headless ? ['--headless=new'] : []),
    ...(process.getuid?.() === 0 || process.env.VEGGA_NO_SANDBOX ? ['--no-sandbox'] : []),
    ...(process.env.VEGGA_CHROME_ARGS ? process.env.VEGGA_CHROME_ARGS.split(' ').filter(Boolean) : []), ...extraArgs, 'about:blank'];
  const proc = spawn(exe, args, { stdio: 'ignore' });
  let exited = false; proc.on('exit', () => { exited = true; });
  let info = null;
  for (let i = 0; i < 80 && !info; i++) {
    if (exited) throw new Error('Chrome exited during startup.');
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(250); }
  }
  if (!info) { proc.kill(); throw new Error(`Chrome did not open a debugging port on ${port}.`); }
  return {
    endpoint: `http://127.0.0.1:${port}`, wsUrl: info.webSocketDebuggerUrl, browser: info.Browser,
    async close() { try { proc.kill('SIGKILL'); } catch {} await sleep(300); await rm(userDataDir, { recursive: true, force: true }).catch(() => {}); },
  };
}

/** Attach to Chrome, inject the wallet into every current and future page, and collect signing requests. */
export async function attachWallet({ wsUrl, walletConfig = {}, shotDir, shotPrefix = 'shot', onLog = () => {} }) {
  const cdp = await Cdp.connect(wsUrl);
  const src = await readFile(join(here, 'inject.js'), 'utf8');
  const source = `globalThis.__VEGGA_CFG = ${JSON.stringify(walletConfig)};\n${src}`;
  const requests = []; const pending = new Set(); const events = [];
  if (shotDir) await mkdir(shotDir, { recursive: true });

  async function prepare(sessionId) {
    // Send everything in one go, resume last. Chrome holds some replies (Runtime.enable) until the paused
    // page is resumed, so awaiting them one by one would deadlock. Commands are still processed in order,
    // so the wallet script is registered before the page's first script runs.
    const calls = [
      cdp.send('Page.enable', {}, sessionId),
      cdp.send('Runtime.enable', {}, sessionId),
      cdp.send('Runtime.addBinding', { name: '__vegga_report' }, sessionId),
      cdp.send('Page.addScriptToEvaluateOnNewDocument', { source, runImmediately: true }, sessionId),
      cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId),
    ];
    const settled = await Promise.allSettled(calls);
    settled.forEach((r) => { if (r.status === 'rejected') onLog(`prepare: ${r.reason.message}`); });
  }

  cdp.on('Target.attachedToTarget', (p) => {
    if (p.targetInfo.type === 'page') prepare(p.sessionId);
    else cdp.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId).catch(() => {});
  });

  cdp.on('Runtime.bindingCalled', (p, sessionId) => {
    if (p.name !== '__vegga_report') return;
    let msg; try { msg = JSON.parse(p.payload); } catch { return; }
    events.push({ kind: msg.kind, at: Date.now() });
    if (msg.kind !== 'sign_request') return;
    const n = requests.length + 1; const entry = { ...msg, n }; requests.push(entry);
    // Snapshot what the person could see at the moment the wallet was asked to sign.
    const job = (async () => {
      try {
        const t = await cdp.send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText : ""', returnByValue: true }, sessionId);
        entry.pageText = t.result?.value || '';
        if (shotDir) {
          const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
          const file = `${shotPrefix}-${n}.png`;
          await writeFile(join(shotDir, file), Buffer.from(s.data, 'base64'));
          entry.shot = file;
        }
      } catch (e) { onLog(`snapshot failed: ${e.message}`); }
    })();
    pending.add(job); job.finally(() => pending.delete(job));
  });

  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const { targetInfos } = await cdp.send('Target.getTargets');
  for (const t of targetInfos.filter((x) => x.type === 'page')) {
    await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true }).catch(() => {});
  }
  return {
    cdp, requests, events,
    async settle() { await Promise.all([...pending]); },
    close() { cdp.close(); },
  };
}
