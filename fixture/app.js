// Vegga Escrow: invoice payments. The screen and the transactions now agree.
// Fixes made from Kane CLI / Vegga round-1 evidence:
//   UNLIMITED_APPROVAL_HIDDEN  approve exactly the amount shown, not an unlimited allowance
//   NETWORK_MISMATCH           read the wallet's chain, warn, block, and re-check right before signing
//   RECIPIENT_MISMATCH         encode the recipient exactly as shown
//   AMOUNT_MISMATCH            USDC has 6 decimals, not 18
//   HIDDEN_NATIVE_VALUE        no ETH value is attached to the payment
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Circle USDC on Sepolia
const ESCROW = '0xE5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0';
const SEPOLIA = 11155111;
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
  $('network-chip').textContent = !connected ? 'Not connected' : wrong ? 'Ethereum Mainnet' : 'Sepolia Testnet';
  $('connect-btn').textContent = connected ? `${ui.account.slice(0, 6)}…${ui.account.slice(-4)}` : 'Connect wallet';
  $('connect-btn').disabled = connected || ui.busy;
  $('network-banner').hidden = !wrong;
  $('recipient').disabled = !connected; $('amount').disabled = !connected;

  const f = form();
  $('recipient-hint').textContent = f.recipient && !isAddr(f.recipient) ? 'Enter a full 0x address (42 characters).' : '';
  $('sum-recipient').textContent = f.recipient || '—';
  $('sum-amount').textContent = f.units ? `${show(f.units)} USDC` : '—';
  $('sum-approval').textContent = f.units ? `${show(f.units)} USDC` : '—';
  $('approve-label').textContent = f.units ? `Approve ${show(f.units)} USDC` : 'Approve';
  $('pay-label').textContent = f.units ? `Pay ${show(f.units)} USDC` : 'Pay';

  const ready = connected && f.ok && !ui.busy && !wrong;
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
// Re-read the wallet's chain right before every signing request, so the screen cannot drift from reality.
async function requireSepolia() {
  ui.chainId = parseInt(await eth.request({ method: 'eth_chainId' }), 16);
  if (ui.chainId !== SEPOLIA) throw new Error('Wrong network. Switch your wallet to Sepolia Testnet.');
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
  await requireSepolia();
  say('Approving…'); render();
  const hash = await eth.request({ method: 'eth_sendTransaction', params: [{ from: ui.account, to: USDC, data: '0x095ea7b3' + w64(ESCROW) + w64(f.units) }] });
  await waitReceipt(hash);
  ui.approved = true; say(`Approved ${show(f.units)} USDC for the escrow contract.`);
}));

$('pay-btn').addEventListener('click', () => guarded(async () => {
  const f = form();
  await requireSepolia();
  say('Paying…'); render();
  const hash = await eth.request({ method: 'eth_sendTransaction', params: [{ from: ui.account, to: ESCROW, data: '0x8340f549' + w64(USDC) + w64(f.recipient) + w64(f.units) }] });
  await waitReceipt(hash);
  ui.receipt = { amount: `${show(f.units)} USDC`, to: f.recipient, hash };
  say('');
}));

['recipient', 'amount'].forEach((id) => $(id).addEventListener('input', () => { ui.approved = false; ui.receipt = null; say(''); render(); }));
render();
