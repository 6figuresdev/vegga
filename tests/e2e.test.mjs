// Real-browser test of Vegga itself (recorder + analyzer + fixture) using the no-AI scripted driver.
// Skipped when no Chrome is found. Set CHROME_PATH or KANE_CLI_CHROME_PATH to point at one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, launchChrome, attachWallet } from '../harness/cdp.js';
import { scriptDriver } from '../harness/script-driver.js';
import { analyze } from '../harness/analyze.js';
import { start } from '../scripts/server.mjs';

const chromePath = findChrome();
const opts = { skip: chromePath ? false : 'no Chrome found (set CHROME_PATH)' };

async function run(dir, query, port) {
  const chrome = await launchChrome({ chrome: chromePath, port, headless: true });
  try {
    const wallet = await attachWallet({ wsUrl: chrome.wsUrl });
    const drv = await scriptDriver({ wsUrl: chrome.wsUrl, url: `http://localhost:4180/${dir}/${query}`, recipient: '0xA11ce5B0b1234567890aBcDeF1234567890aBcDe', amount: '25' });
    await new Promise((r) => setTimeout(r, 400)); await wallet.settle(); wallet.close();
    assert.equal(drv.status, 'passed', drv.summary);
    return analyze({ requests: wallet.requests, claims: drv.finalState });
  } finally { await chrome.close(); }
}

test('shipped fixture: every planted defect is caught', opts, async () => {
  const server = start(4180);
  try {
    const a = await run('fixture-before', '', 9341);
    assert.equal(a.verdict, 'unsafe');
    const ids = new Set(a.findings.map((f) => f.id));
    for (const id of ['RECIPIENT_MISMATCH', 'AMOUNT_MISMATCH', 'UNLIMITED_APPROVAL_HIDDEN', 'NETWORK_MISMATCH', 'HIDDEN_NATIVE_VALUE']) assert.ok(ids.has(id), `missing ${id}`);
  } finally { server.close(); }
});

test('fixed fixture: nothing is flagged', opts, async () => {
  const server = start(4180);
  try {
    const a = await run('fixture', '', 9342);
    assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
    assert.equal(a.findings.filter((f) => f.severity === 'high').length, 0);
  } finally { server.close(); }
});
