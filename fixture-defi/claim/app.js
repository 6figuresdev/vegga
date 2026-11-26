// Vegga Airdrop: "No gas. No approval." Defects (on by default):
//   blind   "Verify wallet" signs an opaque 32-byte hash instead of the message shown on screen
//   permit  "Claim" signs an unlimited Permit2 allowance for an address the screen never shows
// Fix = delete the id from SHIPPED and keep the correct branch.
import { $, SEPOLIA, eth, parseBugs, toHex, short, chainId } from '../common.js';

const SHIPPED = ['blind', 'permit'];
const bugs = parseBugs(SHIPPED);
const bugOn = (id) => bugs.has(id);
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const DISTRIBUTOR = '0xD157D157D157D157D157D157D157D157D157D157';
const ATTACKER = '0xBAD0000000000000000000000000000000000BAD';
const NONCE = '48213';
const MAX160 = ((1n << 160n) - 1n).toString();
const MAX48 = ((1n << 48n) - 1n).toString();

const ui = { account: null, verified: false, busy: false, status: '', kind: '', receipt: null };
const say = (t, k = '') => { ui.status = t; ui.kind = k; };
const message = () => `Vegga Airdrop\nVerify wallet ${ui.account}\nNonce: ${NONCE}`;

function render() {
  const connected = !!ui.account;
  $('network-chip').textContent = connected ? 'Sepolia Testnet' : 'Not connected';
  $('connect-btn').textContent = connected ? short(ui.account) : 'Connect wallet';
  $('connect-btn').disabled = connected || ui.busy;
  $('verify-message').textContent = connected ? message() : 'Connect your wallet to see the message you will sign.';
  $('claim-claimant').textContent = ui.account || '—';
  $('verify-btn').disabled = !(connected && !ui.verified && !ui.busy);
  $('claim-btn').disabled = !(connected && ui.verified && !ui.busy);
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
  if ((await chainId()) !== SEPOLIA) await eth().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + SEPOLIA.toString(16) }] });
  say('');
}));

$('verify-btn').addEventListener('click', () => guarded(async () => {
  // FIXED: sign the readable message shown above. BUG 'blind': sign an opaque 32-byte value instead.
  const payload = bugOn('blind') ? '0x' + '00c0ffee9f2c'.repeat(5) + '0000' : toHex(message());
  say('Waiting for signature…'); render();
  await eth().request({ method: 'personal_sign', params: [payload, ui.account] });
  ui.verified = true; say('Wallet verified.');
}));

$('claim-btn').addEventListener('click', () => guarded(async () => {
  const eip712 = [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }];
  // FIXED: sign the Claim shown on screen (claimant, amount, nonce).
  // BUG 'permit': sign an unlimited, never-expiring Permit2 allowance for an address the screen never mentions.
  const typed = bugOn('permit')
    ? {
        types: { EIP712Domain: eip712.slice(0, 1).concat(eip712.slice(2)), PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' }],
          PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }] },
        domain: { name: 'Permit2', chainId: SEPOLIA, verifyingContract: PERMIT2 }, primaryType: 'PermitSingle',
        message: { details: { token: USDC, amount: MAX160, expiration: MAX48, nonce: '0' }, spender: ATTACKER, sigDeadline: MAX48 },
      }
    : {
        types: { EIP712Domain: eip712, Claim: [{ name: 'claimant', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }] },
        domain: { name: 'Vegga Airdrop', version: '1', chainId: SEPOLIA, verifyingContract: DISTRIBUTOR }, primaryType: 'Claim',
        message: { claimant: ui.account, amount: '100', nonce: NONCE },
      };
  say('Waiting for signature…'); render();
  const sig = await eth().request({ method: 'eth_signTypedData_v4', params: [ui.account, JSON.stringify(typed)] });
  ui.receipt = `Claim signed. Signature ${sig.slice(0, 10)}…${sig.slice(-6)}.`; say('');
}));
render();
