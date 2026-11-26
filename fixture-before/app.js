// Vegga Escrow: a deliberately flawed invoice-payment dapp, as a coding agent might ship it.
// The screen is correct. The TRANSACTIONS it asks the wallet to sign are not. Vegga catches the difference.
//
// To fix a defect: delete its id from SHIPPED_BUGS and remove the `bugOn('<id>')` branch that uses it.
const SHIPPED_BUGS = ['recipient', 'decimals', 'approval', 'network', 'value'];

const raw = new URLSearchParams(location.search).get('bugs');
const bugs = raw === null ? new Set(SHIPPED_BUGS) : raw === '' || raw === 'none' ? new Set() : new Set(raw.split(',').map((s) => s.trim()));
const bugOn = (id) => bugs.has(id);

const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Circle USDC on Sepolia
const ESCROW = '0xE5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0';
const SEPOLIA = 11155111;
const MAX_UINT = (1n << 256n) - 1n;
const $ = (id) => document.getElementById(id);
const w64 = (x) => (typeof x === 'bigint' ? x.toString(16) : String(x).replace(/^0x/, '').toLowerCase()).padStart(64, '0');
const isAddr = (s) => /^0x[0-9a-fA-F]{40}$/.test(s);

function toUnits(text, decimals) {
  const t = String(text || '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  if (f.length > 6) return null;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0').slice(0, decimals) || '0');
}
const show = (v) => (v === null ? '—' : `${Number(v / 10000n) / 100}`.replace(/^(\d+)$/, '$1.00').replace(/^(\d+\.\d)$/, '$10'));

const eth = window.ethereum;
const ui = { account: null, chainId: null, approved: false, busy: false, status: '', kind: '', receipt: null };
const say = (t, k = '') => { ui.status = t; ui.kind = k; };

function form() {
  const recipient = $('recipient').value.trim();
  const units = toUnits($('amount').value, 6);
  return { recipient, units, ok: isAddr(recipient) && units !== null && units > 0n };
}

function render() {
  const connected = !!ui.account;
  const wrong = connected && ui.chainId !== SEPOLIA;
  // BUG 'network': the header just prints the dapp's own network name and never reads the wallet's chain.
  $('network-chip').textContent = !connected ? 'Not connected' : bugOn('network') ? 'Sepolia Testnet' : wrong ? 'Ethereum Mainnet' : 'Sepolia Testnet';
  $('connect-btn').textContent = connected ? `${ui.account.slice(0, 6)}…${ui.account.slice(-4)}` : 'Connect wallet';
  $('connect-btn').disabled = connected || ui.busy;
  // FIXED: warn about the wrong network and block payment. BUG 'network': never checked.
  $('network-banner').hidden = !(wrong && !bugOn('network'));
  $('recipient').disabled = !connected; $('amount').disabled = !connected;

  const f = form();
  $('recipient-hint').textContent = f.recipient && !isAddr(f.recipient) ? 'Enter a full 0x address (42 characters).' : '';
  $('sum-recipient').textContent = f.recipient || '—';
  $('sum-amount').textContent = f.units ? `${show(f.units)} USDC` : '—';
  $('sum-approval').textContent = f.units ? `${show(f.units)} USDC` : '—';
  $('approve-label').textContent = f.units ? `Approve ${show(f.units)} USDC` : 'Approve';
  $('pay-label').textContent = f.units ? `Pay ${show(f.units)} USDC` : 'Pay';

  const ready = connected && f.ok && !ui.busy && (bugOn('network') || !wrong);
  $('approve-btn').disabled = !(ready && !ui.approved);
  $('pay-btn').disabled = !(ready && ui.approved);
  $('status').textContent = ui.status; $('status').className = `status ${ui.kind}`.trim();
  $('receipt').hidden = !ui.receipt;
  if (ui.receipt) {
    $('rc-amount').textContent = ui.receipt.amount; $('rc-to').textContent = ui.receipt.to;
    $('rc-hash').textContent = `${ui.receipt.hash.slice(0, 10)}…${ui.receipt.hash.slice(-6)}`;
  }
}

async function guarded(fn) {
  ui.busy = true; render();
  try { await fn(); } catch (e) { say(e?.message || 'Wallet request failed.', 'err'); } finally { ui.busy = false; render(); }
}
async function waitReceipt(hash) {
  for (let i = 0; i < 20; i++) {
    const r = await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error('Transaction was not confirmed.');
}

$('connect-btn').addEventListener('click', () => guarded(async () => {
  if (!eth) throw new Error('No wallet found. Install a wallet and reload.');
  const [account] = await eth.request({ method: 'eth_requestAccounts' });
  ui.account = account; ui.chainId = parseInt(await eth.request({ method: 'eth_chainId' }), 16);
  eth.on?.('chainChanged', (id) => { ui.chainId = parseInt(id, 16); render(); });
  say('');
}));

$('switch-btn').addEventListener('click', () => guarded(async () => {
  await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + SEPOLIA.toString(16) }] });
  ui.chainId = SEPOLIA; say('');
}));

$('approve-btn').addEventListener('click', () => guarded(async () => {
  const f = form();
  // FIXED: approve exactly the amount shown. BUG 'approval': approves an unlimited allowance.
  const allowance = bugOn('approval') ? MAX_UINT : f.units;
  say('Approving…');  render();
  const hash = await eth.request({ method: 'eth_sendTransaction', params: [{ from: ui.account, to: USDC, data: '0x095ea7b3' + w64(ESCROW) + w64(allowance) }] });
  await waitReceipt(hash);
  ui.approved = true; say(`Approved ${show(f.units)} USDC for the escrow contract.`);
}));

$('pay-btn').addEventListener('click', () => guarded(async () => {
  const f = form();
  // FIXED: encode the recipient and amount exactly as shown.
  // BUG 'recipient': last character of the address is changed (address-poisoning lookalike).
  const recipient = bugOn('recipient') ? f.recipient.slice(0, -1) + (f.recipient.endsWith('0') ? '1' : '0') : f.recipient;
  // BUG 'decimals': USDC has 6 decimals, this encodes 18.
  const amount = bugOn('decimals') ? toUnits($('amount').value, 18) : f.units;
  // BUG 'value': attaches 0.05 ETH that the screen never mentions.
  const tx = { from: ui.account, to: ESCROW, data: '0x8340f549' + w64(USDC) + w64(recipient) + w64(amount) };
  if (bugOn('value')) tx.value = '0xb1a2bc2ec50000';
  say('Paying…'); render();
  const hash = await eth.request({ method: 'eth_sendTransaction', params: [tx] });
  await waitReceipt(hash);
  ui.receipt = { amount: `${show(f.units)} USDC`, to: f.recipient, hash };
  say('');
}));

['recipient', 'amount'].forEach((id) => $(id).addEventListener('input', () => { ui.approved = false; ui.receipt = null; say(''); render(); }));
window.vegga = { bugs: [...bugs] };
render();
