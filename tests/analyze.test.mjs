import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, chainsOnPage } from '../harness/analyze.js';

const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const ESCROW = '0xE5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0E5c0';
const RCP = '0xA11ce5B0b1234567890aBcDeF1234567890aBcDe';
const w = (x) => (typeof x === 'bigint' ? x.toString(16) : x.replace(/^0x/, '').toLowerCase()).padStart(64, '0');
const PAGE = `Pay an invoice\nRecipient ${RCP}\nAmount 25.00 USDC\nNetwork Sepolia Testnet\nEscrow contract ${ESCROW}\nAllowance you approve 25.00 USDC`;
const approve = (amt, chain = 11155111) => ({ method: 'eth_sendTransaction', walletChainId: chain, pageText: PAGE, params: [{ to: USDC, data: '0x095ea7b3' + w(ESCROW) + w(amt) }] });
const deposit = (rcp, amt, chain = 11155111, value) => ({ method: 'eth_sendTransaction', walletChainId: chain, pageText: PAGE, params: [{ to: ESCROW, ...(value ? { value } : {}), data: '0x8340f549' + w(USDC) + w(rcp) + w(amt) }] });
const ids = (a) => a.findings.map((f) => f.id);

test('clean flow is safe', () => {
  const a = analyze({ requests: [approve(25_000_000n), deposit(RCP, 25_000_000n)] });
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
});
test('swapped last character of recipient is caught with the closest address', () => {
  const a = analyze({ requests: [deposit(RCP.slice(0, -1) + 'f', 25_000_000n)] });
  assert.equal(a.verdict, 'unsafe');
  assert.ok(ids(a).includes('RECIPIENT_MISMATCH'));
  assert.ok(a.findings[0].message.includes(RCP), a.findings[0].message);
});
test('18-decimals amount is caught', () => {
  const a = analyze({ requests: [deposit(RCP, 25n * 10n ** 18n)] });
  assert.ok(ids(a).includes('AMOUNT_MISMATCH'));
});
test('hidden unlimited approval is caught', () => {
  const a = analyze({ requests: [approve((1n << 256n) - 1n)] });
  assert.ok(ids(a).includes('UNLIMITED_APPROVAL_HIDDEN'));
});
test('disclosed unlimited approval is only a warning', () => {
  const r = approve((1n << 256n) - 1n); r.pageText += '\nUnlimited approval';
  const a = analyze({ requests: [r] });
  assert.equal(a.verdict, 'safe');
  assert.ok(ids(a).includes('UNLIMITED_APPROVAL'));
});
test('wrong network is caught', () => {
  const a = analyze({ requests: [approve(25_000_000n, 1)] });
  assert.ok(ids(a).includes('NETWORK_MISMATCH'));
});
test('hidden native value is caught', () => {
  const a = analyze({ requests: [deposit(RCP, 25_000_000n, 11155111, '0xb1a2bc2ec50000')] });
  assert.ok(ids(a).includes('HIDDEN_NATIVE_VALUE'));
});
test('no signing request is inconclusive, not safe', () => {
  assert.equal(analyze({ requests: [] }).verdict, 'inconclusive');
});
test('truncated-only recipient display is a warning', () => {
  const r = deposit(RCP, 25_000_000n); r.pageText = PAGE.replace(RCP, '0xA11ce5…Cde').replace(ESCROW, ESCROW);
  const a = analyze({ requests: [r] });
  assert.ok(ids(a).includes('RECIPIENT_ONLY_TRUNCATED'));
  assert.equal(a.verdict, 'safe');
});
test('Kane claims that disagree with the signed payload are flagged', () => {
  const a = analyze({ requests: [deposit(RCP, 25_000_000n)], claims: { ui_recipient: '0xA11ce5B0b1234567890aBcDeF1234567890aBcDf', ui_amount: '30.00 USDC', ui_network: 'Ethereum Mainnet' } });
  assert.deepEqual(ids(a).filter((i) => i.startsWith('AGENT_')).sort(), ['AGENT_AMOUNT_MISMATCH', 'AGENT_NETWORK_MISMATCH', 'AGENT_RECIPIENT_MISMATCH']);
});
test('chain detection does not double count Base Sepolia', () => {
  assert.deepEqual([...chainsOnPage('Network: Base Sepolia')], [84532]);
});
