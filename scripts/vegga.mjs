#!/usr/bin/env node
// vegga verify: drive a dapp with Kane CLI while a test wallet records what the dapp asks to sign.
//
//   node scripts/vegga.mjs verify --label round-1 --url http://localhost:4173/fixture/
//   node scripts/vegga.mjs verify --url https://your-dapp.xyz --objective "Go to {url}. Connect the wallet, …"
//
// Flags: --driver kane|script  --only SG-01  --headless  --chrome <path>  --port 9333  --timeout 240
//        --confirm-delay 700  --rpc <url>  --token 0xaddr:SYMBOL:decimals  --abi <json file>  --dry
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, attachWallet } from '../harness/cdp.js';
import { runKane } from '../harness/kane.js';
import { scriptDriver } from '../harness/script-driver.js';
import { analyze, normalizeClaims } from '../harness/analyze.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd !== 'verify') {
  console.log('Usage: node scripts/vegga.mjs verify [--label round-1] [--url <dapp>] [--driver kane|script] [--only SG-01] [--headless] [--dry]');
  process.exit(cmd ? 2 : 0);
}

const label = flag('label', `round-${new Date().toISOString().slice(0, 16)}`);
const url = flag('url', 'http://localhost:4173/fixture/');
const driver = flag('driver', 'kane');
const port = Number(flag('port', 9333));
const dry = has('dry');
const only = flag('only') ? String(flag('only')).split(',') : null;

let scenarios = JSON.parse(await readFile(join(root, flag('scenarios', 'scenarios/fixture.json')), 'utf8')).scenarios;
if (flag('objective')) scenarios = [{ id: 'CUSTOM', title: flag('title', 'Custom flow'), objective: flag('objective') }];
if (only) scenarios = scenarios.filter((s) => only.includes(s.id));

const tokens = {};
argv.forEach((a, i) => { if (a === '--token' && argv[i + 1]) { const [addr, symbol, dec] = argv[i + 1].split(':'); tokens[addr.toLowerCase()] = { symbol, decimals: Number(dec) }; } });
const registry = flag('abi') ? JSON.parse(await readFile(flag('abi'), 'utf8')) : {};
const scenarioUrl = (s) => {
  if (!s.path) return url;
  const u = new URL(url); u.pathname = u.pathname.replace(/\/?$/, '/') + s.path; return u.toString();
};
const fill = (s) => s.objective.replaceAll('{url}', scenarioUrl(s)).replaceAll('{recipient}', s.recipient || '').replaceAll('{amount}', s.amount || '');

if (dry) {
  for (const s of scenarios) { console.log(`# ${s.id} ${s.title}`); await runKane({ objective: fill(s), url: scenarioUrl(s), cdpEndpoint: `http://127.0.0.1:${port}`, dry: true }); }
  process.exit(0);
}

const results = [];
for (const s of scenarios) {
  process.stdout.write(`▶ ${s.id} ${s.title}\n`);
  let chrome; let wallet;
  try {
    chrome = await launchChrome({ chrome: flag('chrome'), port, headless: has('headless') });
    wallet = await attachWallet({
      wsUrl: chrome.wsUrl, shotDir: join(root, 'evidence/shots'), shotPrefix: `${label}-${s.id}`,
      walletConfig: { confirmDelayMs: Number(flag('confirm-delay', 700)), rpc: flag('rpc', null) },
      onLog: (m) => process.stderr.write(`  [wallet] ${m}\n`),
    });
    let drv;
    if (driver === 'script') drv = await scriptDriver({ wsUrl: chrome.wsUrl, url: scenarioUrl(s), recipient: s.recipient, amount: s.amount, flow: s.flow });
    else drv = await runKane({ objective: fill(s), url: scenarioUrl(s), cdpEndpoint: chrome.endpoint, timeout: Number(flag('timeout', 240)), onProgress: (e) => e.status === 'done' && process.stdout.write(`  · ${e.remark}\n`) });
    await sleep(500); await wallet.settle();
    if (driver === 'kane' && drv.status !== 'skipped') {
      const keys = Object.keys(normalizeClaims(drv.finalState || {}));
      if (!keys.some((k) => k.startsWith('ui_'))) console.log(`  ! Kane returned no ui_* values (saw: ${keys.join(', ') || 'none'}). Agent-vs-signed checks were skipped; the screen checks still ran.`);
    }

    const a = analyze({ requests: wallet.requests, claims: drv.finalState || {}, opts: { tokens, registry } });
    if (drv.status !== 'passed' && a.verdict === 'safe') {
      a.findings.push({ id: 'FLOW_INCOMPLETE', severity: 'inconclusive', source: 'kane', message: `The driver did not finish the flow (${drv.status}${drv.summary ? ': ' + drv.summary : ''}).` });
      a.verdict = 'inconclusive';
    }
    results.push({
      id: s.id, title: s.title, verdict: a.verdict, findings: a.findings, rows: a.rows, requests: a.requests, driver,
      kane: { status: drv.status, summary: drv.summary, testUrl: drv.testUrl, duration: drv.duration, credits: drv.credits, finalState: drv.finalState, failedStep: drv.failedStep },
    });
    const high = a.findings.filter((f) => f.severity === 'high').length;
    console.log(`  ${a.verdict === 'safe' ? '✔ safe' : a.verdict === 'unsafe' ? `✘ UNSAFE (${high} high-severity)` : '? inconclusive'}`);
    a.findings.filter((f) => f.severity !== 'warn').forEach((f) => console.log(`    - ${f.id}: ${f.message}`));
  } catch (e) {
    console.log(`  ✘ error: ${e.message}`);
    results.push({ id: s.id, title: s.title, verdict: 'inconclusive', findings: [{ id: 'HARNESS_ERROR', severity: 'inconclusive', source: 'harness', message: e.message }], rows: [], requests: [], driver, kane: {} });
  } finally { wallet?.close(); await chrome?.close(); }
}

const reportPath = join(root, 'evidence/report.json');
await mkdir(dirname(reportPath), { recursive: true });
let report = { project: 'Vegga', rounds: [] };
try { report = JSON.parse(await readFile(reportPath, 'utf8')); } catch {}
report.rounds = report.rounds.filter((r) => r.label !== label);
report.rounds.push({ label, url, driver, startedAt: new Date().toISOString(), results });
await writeFile(reportPath, JSON.stringify(report, null, 2));

const bad = results.filter((r) => r.verdict !== 'safe');
console.log(`\n${label}: ${results.length - bad.length}/${results.length} flows safe`);
if (bad.length) {
  const md = ['# Vegga: what the dapp showed is not what it asked users to sign', '',
    'Kane CLI drove the real UI while a test wallet recorded every signing request. Fix the DAPP. Do not edit the harness or scenarios.', '',
    ...bad.flatMap((r) => [`## ${r.id} · ${r.title} (${r.verdict})`, ...r.findings.filter((f) => f.severity !== 'warn').map((f) => `- **${f.id}**: ${f.message}`), '']),
    `When done run: node scripts/vegga.mjs verify --label <next-round> --url ${url}`];
  await writeFile(join(root, 'evidence/FIX_PROMPT.md'), md.join('\n'));
  console.log('Fix brief written to evidence/FIX_PROMPT.md');
}
process.exit(bad.length ? 1 : 0);
