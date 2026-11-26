// A deterministic, no-AI driver for the bundled fixture only. It exists so Vegga's own recorder and analyzer
// can be tested in CI without spending Kane credits. Real verification uses Kane (--driver kane, the default).
import { Cdp } from './cdp.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scriptDriver({ wsUrl, url, recipient, amount }) {
  const cdp = await Cdp.connect(wsUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const j = JSON.stringify;
  const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
  const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timeout waiting for: ${expr}`); };
  const click = (sel) => ev(`document.querySelector(${j(sel)}).click()`);
  const type = (sel, v) => ev(`(()=>{const e=document.querySelector(${j(sel)});e.value=${j(v)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const text = (sel) => ev(`(document.querySelector(${j(sel)})||{}).textContent||''`);
  try {
    await waitFor(`!!document.querySelector('#connect-btn') && !document.querySelector('#connect-btn').disabled`);
    await click('#connect-btn');
    await waitFor(`document.querySelector('#connect-btn').textContent.startsWith('0x')`);
    if (await ev(`!document.querySelector('#network-banner').hidden`)) {
      await click('#switch-btn');
      await waitFor(`document.querySelector('#network-banner').hidden`);
    }
    await type('#recipient', recipient); await type('#amount', amount);
    const claims = {
      ui_recipient: (await text('#sum-recipient')).trim(), ui_amount: (await text('#sum-amount')).trim(),
      ui_network: (await text('#sum-network')).trim(), ui_approval_amount: (await text('#sum-approval')).trim(),
    };
    await waitFor(`!document.querySelector('#approve-btn').disabled`);
    await click('#approve-btn');
    await waitFor(`document.querySelector('#status').textContent.includes('Approved')`);
    await waitFor(`!document.querySelector('#pay-btn').disabled`);
    await click('#pay-btn');
    await waitFor(`!document.querySelector('#receipt').hidden`);
    return { status: 'passed', finalState: claims, summary: 'Scripted fixture flow completed (not Kane).' };
  } catch (e) {
    let diag = '';
    try { diag = await ev(`JSON.stringify({wallet: !!window.ethereum, injected: !!window.__vegga_installed, status: (document.querySelector('#status')||{}).textContent, url: location.href})`); } catch {}
    return { status: 'failed', finalState: {}, summary: `${e.message || e} | page: ${diag}` };
  } finally { cdp.close(); }
}
