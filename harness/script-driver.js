// A deterministic, no-AI driver for the bundled demo dapps only. It exists so Vegga's own recorder and analyzer
// can be tested in CI without spending Kane credits. Real verification uses Kane (--driver kane, the default).
import { Cdp } from './cdp.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scriptDriver({ wsUrl, url, recipient, amount, flow = 'invoice' }) {
  const cdp = await Cdp.connect(wsUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const j = JSON.stringify;
  const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
  const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout waiting for: ${expr}`); };
  const click = (sel) => ev(`document.querySelector(${j(sel)}).click()`);
  const type = (sel, v) => ev(`(()=>{const e=document.querySelector(${j(sel)});e.value=${j(v)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const text = async (sel) => ((await ev(`(document.querySelector(${j(sel)})||{}).textContent||''`)) || '').trim();
  const enabled = (sel) => `!!document.querySelector(${j(sel)}) && !document.querySelector(${j(sel)}).disabled`;
  const visible = (sel) => `!document.querySelector(${j(sel)}).hidden`;
  const connect = async () => {
    await waitFor(enabled('#connect-btn')); await click('#connect-btn');
    await waitFor(`document.querySelector('#connect-btn').textContent.startsWith('0x')`);
  };
  try {
    await connect();
    let claims = {};
    if (flow === 'invoice') {
      if (await ev(`!document.querySelector('#network-banner').hidden`)) { await click('#switch-btn'); await waitFor(`document.querySelector('#network-banner').hidden`); }
      await type('#recipient', recipient); await type('#amount', amount);
      claims = { ui_recipient: await text('#sum-recipient'), ui_amount: await text('#sum-amount'), ui_network: await text('#sum-network'), ui_approval_amount: await text('#sum-approval') };
      await waitFor(enabled('#approve-btn')); await click('#approve-btn');
      await waitFor(`document.querySelector('#status').textContent.includes('Approved')`);
      await waitFor(enabled('#pay-btn')); await click('#pay-btn');
      await waitFor(visible('#receipt'));
    } else if (flow === 'swap') {
      if (await ev(`!document.querySelector('#network-banner').hidden`)) { await click('#switch-btn'); await waitFor(`document.querySelector('#network-banner').hidden`); }
      await type('#amount', amount);
      claims = { ui_amount: await text('#sum-pay'), ui_min_received: await text('#sum-min'), ui_recipient: await text('#sum-recipient'), ui_network: await text('#sum-network') };
      await waitFor(enabled('#approve-btn')); await click('#approve-btn');
      await waitFor(`document.querySelector('#status').textContent.includes('Approved')`);
      await waitFor(enabled('#swap-btn')); await click('#swap-btn');
      await waitFor(visible('#receipt'));
    } else if (flow === 'claim') {
      claims = { ui_message: await text('#verify-message') };
      await waitFor(enabled('#verify-btn')); await click('#verify-btn');
      await waitFor(`document.querySelector('#status').textContent.includes('Wallet verified')`);
      claims.ui_recipient = await text('#claim-claimant'); claims.ui_amount = await text('#claim-amount');
      await waitFor(enabled('#claim-btn')); await click('#claim-btn');
      await waitFor(visible('#receipt'));
    } else throw new Error(`unknown flow ${flow}`);
    return { status: 'passed', finalState: claims, summary: 'Scripted demo flow completed (not Kane).' };
  } catch (e) {
    let diag = '';
    try { diag = await ev(`JSON.stringify({wallet: !!window.ethereum, injected: !!window.__vegga_installed, status: (document.querySelector('#status')||{}).textContent, url: location.href})`); } catch {}
    return { status: 'failed', finalState: {}, summary: `${e.message || e} | page: ${diag}` };
  } finally { cdp.close(); }
}
