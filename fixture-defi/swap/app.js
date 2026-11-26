// Vegga Swap: the screen is correct; the swap transaction is not. Defects (all on by default):
//   slippage  signs amountOutMin = 0 while the screen promises a minimum received
//   swapto    sends the swap output to someone else's address
//   tokenout  swaps into USDT while the screen says DAI
// Fix = delete the id from SHIPPED and keep the correct branch.
import { $, SEPOLIA, eth, parseBugs, w64, toUnits, fmt, waitReceipt, chainId } from '../common.js';

const SHIPPED = ['slippage', 'swapto', 'tokenout'];
const bugs = parseBugs(SHIPPED);
const bugOn = (id) => bugs.has(id);
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const DAI = '0x6B175474E89094C44da98b954EedeAC495271d0F';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const ATTACKER = '0xBAD0000000000000000000000000000000000BAD';

const ui = { account: null, chain: null, approved: false, busy: false, status: '', kind: '', receipt: null };
const say = (t, k = '') => { ui.status = t; ui.kind = k; };

function quote() {
  const units = toUnits($('amount').value, 6);
  if (!units || units === 0n) return null;
  const est = units * 10n ** 12n;      // 1 USDC ~ 1 DAI, DAI has 18 decimals
  return { units, est, min: (est * 99n) / 100n }; // 1% slippage
}

function render() {
  const connected = !!ui.account; const wrong = connected && ui.chain !== SEPOLIA; const q = quote();
  $('network-chip').textContent = !connected ? 'Not connected' : wrong ? 'Ethereum Mainnet' : 'Sepolia Testnet';
  $('connect-btn').textContent = connected ? `${ui.account.slice(0, 6)}…${ui.account.slice(-4)}` : 'Connect wallet';
  $('connect-btn').disabled = connected || ui.busy;
  $('network-banner').hidden = !wrong;
  $('amount').disabled = !connected;
  $('sum-pay').textContent = q ? `${fmt(q.units, 6)} USDC` : '—';
  $('sum-receive').textContent = q ? `≈ ${fmt(q.est, 18)} DAI` : '—';
  $('sum-min').textContent = q ? `${fmt(q.min, 18)} DAI` : '—';
  $('sum-recipient').textContent = ui.account || '—';
  $('approve-label').textContent = q ? `Approve ${fmt(q.units, 6)} USDC` : 'Approve';
  $('swap-label').textContent = q ? `Swap ${fmt(q.units, 6)} USDC for DAI` : 'Swap';
  const ready = connected && !!q && !wrong && !ui.busy;
  $('approve-btn').disabled = !(ready && !ui.approved);
  $('swap-btn').disabled = !(ready && ui.approved);
  $('status').textContent = ui.status; $('status').className = `status ${ui.kind}`.trim();
  $('receipt').hidden = !ui.receipt;
  if (ui.receipt) $('rc-text').textContent = ui.receipt;
}
async function guarded(fn) {
  ui.busy = true; render();
  try { await fn(); } catch (e) { say(e?.message || 'Wallet request failed.', 'err'); } finally { ui.busy = false; render(); }
}

$('connect-btn').addEventListener('click', () => guarded(async () => {
  if (!eth()) throw new Error('No wallet found. Install a wallet and reload.');
  [ui.account] = await eth().request({ method: 'eth_requestAccounts' });
  ui.chain = await chainId();
  eth().on?.('chainChanged', (id) => { ui.chain = parseInt(id, 16); render(); });
  say('');
}));
$('switch-btn').addEventListener('click', () => guarded(async () => {
  await eth().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + SEPOLIA.toString(16) }] });
  ui.chain = SEPOLIA; say('');
}));
$('approve-btn').addEventListener('click', () => guarded(async () => {
  const q = quote();
  say('Approving…'); render();
  const hash = await eth().request({ method: 'eth_sendTransaction', params: [{ from: ui.account, to: USDC, data: '0x095ea7b3' + w64(ROUTER) + w64(q.units) }] });
  await waitReceipt(hash);
  ui.approved = true; say(`Approved ${fmt(q.units, 6)} USDC for the router.`);
}));
$('swap-btn').addEventListener('click', () => guarded(async () => {
  const q = quote();
  const minOut = bugOn('slippage') ? 0n : q.min;                 // BUG 'slippage'
  const to = bugOn('swapto') ? ATTACKER : ui.account;            // BUG 'swapto'
  const out = bugOn('tokenout') ? USDT : DAI;                    // BUG 'tokenout'
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const data = '0x38ed1739' + w64(q.units) + w64(minOut) + w64(160n) + w64(to) + w64(deadline) + w64(2n) + w64(USDC) + w64(out);
  say('Swapping…'); render();
  const hash = await eth().request({ method: 'eth_sendTransaction', params: [{ from: ui.account, to: ROUTER, data }] });
  await waitReceipt(hash);
  ui.receipt = `Swapped ${fmt(q.units, 6)} USDC. Transaction ${hash.slice(0, 10)}…${hash.slice(-6)}.`; say('');
}));
$('amount').addEventListener('input', () => { ui.approved = false; ui.receipt = null; say(''); render(); });
render();
