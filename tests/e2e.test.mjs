// Real-browser tests of Vegga itself (recorder + analyzer + demo dapps) using the no-AI scripted driver.
// Skipped when no Chrome is found. Set CHROME_PATH or KANE_CLI_CHROME_PATH to point at one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, launchChrome, attachWallet } from '../harness/cdp.js';
import { scriptDriver } from '../harness/script-driver.js';
import { analyze } from '../harness/analyze.js';
import { start } from '../scripts/server.mjs';

const chromePath = findChrome();
const opts = { skip: chromePath ? false : 'no Chrome found (set CHROME_PATH)' };
let port = 9350;

async function run(path, flow, extra = {}) {
  const chrome = await launchChrome({ chrome: chromePath, port: port++, headless: true });
  try {
    const wallet = await attachWallet({ wsUrl: chrome.wsUrl });
    const drv = await scriptDriver({ wsUrl: chrome.wsUrl, url: `http://localhost:4180/${path}`, flow, ...extra });
    await new Promise((r) => setTimeout(r, 400)); await wallet.settle(); wallet.close();
    assert.equal(drv.status, 'passed', drv.summary);
    return analyze({ requests: wallet.requests, claims: drv.finalState });
  } finally { await chrome.close(); }
}
const inv = { recipient: '0xA11ce5B0b1234567890aBcDeF1234567890aBcDe', amount: '25' };
const ids = (a) => new Set(a.findings.map((f) => f.id));
const withServer = (fn) => async () => { const s = start(4180); try { await fn(); } finally { s.close(); } };

test('invoice dapp, shipped build: every planted defect is caught', opts, withServer(async () => {
  const a = await run('fixture-before/', 'invoice', inv);
  assert.equal(a.verdict, 'unsafe');
  for (const id of ['RECIPIENT_MISMATCH', 'AMOUNT_MISMATCH', 'UNLIMITED_APPROVAL_HIDDEN', 'NETWORK_MISMATCH', 'HIDDEN_NATIVE_VALUE']) assert.ok(ids(a).has(id), `missing ${id}`);
}));

test('invoice dapp, fixed build: nothing is flagged', opts, withServer(async () => {
  const a = await run('fixture/', 'invoice', inv);
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
}));

test('swap dapp, shipped build: slippage, redirected output and wrong token are caught', opts, withServer(async () => {
  const a = await run('fixture-defi/swap/', 'swap', { amount: '25' });
  assert.equal(a.verdict, 'unsafe');
  for (const id of ['SLIPPAGE_UNPROTECTED', 'SWAP_OUTPUT_REDIRECTED', 'TOKEN_SYMBOL_MISMATCH']) assert.ok(ids(a).has(id), `missing ${id}`);
}));

test('swap dapp, fixed build: nothing is flagged', opts, withServer(async () => {
  const a = await run('fixture-defi/swap/?bugs=none', 'swap', { amount: '25' });
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
}));

test('airdrop dapp, shipped build: blind signature and hidden Permit2 are caught', opts, withServer(async () => {
  const a = await run('fixture-defi/claim/', 'claim');
  assert.equal(a.verdict, 'unsafe');
  for (const id of ['BLIND_SIGNATURE', 'UNLIMITED_APPROVAL_HIDDEN', 'SPENDER_NOT_SHOWN']) assert.ok(ids(a).has(id), `missing ${id}`);
}));

test('airdrop dapp, fixed build: nothing is flagged', opts, withServer(async () => {
  const a = await run('fixture-defi/claim/?bugs=none', 'claim');
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
}));
