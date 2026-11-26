import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../harness/analyze.js';
import { decodeCall } from '../harness/decode.js';

const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const DAI = '0x6B175474E89094C44da98b954EedeAC495271d0F';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const ME = '0xBEEF00000000000000000000000000000000BEEF';
const BAD = '0xBAD0000000000000000000000000000000000BAD';
const w = (x) => (typeof x === 'bigint' ? x.toString(16) : String(x).replace(/^0x/, '').toLowerCase()).padStart(64, '0');
const ids = (a) => a.findings.map((f) => f.id);
const MAXU = (1n << 256n) - 1n;

const swapData = (amountIn, minOut, path, to) =>
  '0x38ed1739' + w(amountIn) + w(minOut) + w(160n) + w(to) + w(9999999999n) + w(BigInt(path.length)) + path.map(w).join('');
const SWAP_PAGE = `Swap\nYou pay 25.00 USDC\nYou receive ≈ 25.00 DAI\nMinimum received 24.75 DAI\nRecipient (your wallet) ${ME}\nRouter ${ROUTER}\nNetwork Sepolia Testnet`;
const swapReq = (min, path, to) => ({ method: 'eth_sendTransaction', walletChainId: 11155111, account: ME, pageText: SWAP_PAGE, params: [{ to: ROUTER, data: swapData(25_000_000n, min, path, to) }] });

test('swap calldata is decoded including the path array', () => {
  const c = decodeCall(swapData(25_000_000n, 24n * 10n ** 18n, [USDC, DAI], ME));
  assert.equal(c.name, 'swapExactTokensForTokens');
  assert.equal(c.args.path.length, 2);
  assert.equal(c.args.path[1].toLowerCase(), DAI.toLowerCase());
  assert.equal(c.args.to.toLowerCase(), ME.toLowerCase());
});
test('honest swap is safe', () => {
  const a = analyze({ requests: [swapReq(24_750_000_000_000_000_000n, [USDC, DAI], ME)] });
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
});
test('zero minimum received is flagged as unprotected slippage', () => {
  assert.ok(ids(analyze({ requests: [swapReq(0n, [USDC, DAI], ME)] })).includes('SLIPPAGE_UNPROTECTED'));
});
test('wrong decimals in minimum received is flagged', () => {
  assert.ok(ids(analyze({ requests: [swapReq(24_750_000n, [USDC, DAI], ME)] })).includes('MIN_RECEIVED_MISMATCH'));
});
test('swap output redirected to another address is flagged', () => {
  const a = analyze({ requests: [swapReq(24_750_000_000_000_000_000n, [USDC, DAI], BAD)] });
  assert.ok(ids(a).includes('SWAP_OUTPUT_REDIRECTED'));
  assert.ok(ids(a).includes('RECIPIENT_MISMATCH'));
});
test('swapping into a different token than the screen says is flagged', () => {
  assert.ok(ids(analyze({ requests: [swapReq(24_750_000_000_000_000_000n, [USDC, USDT], ME)] })).includes('TOKEN_SYMBOL_MISMATCH'));
});

const permit2 = (amount, spender, extra = {}) => JSON.stringify({
  domain: { name: 'Permit2', chainId: 11155111, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
  primaryType: 'PermitSingle',
  message: { details: { token: USDC, amount: amount.toString(), expiration: ((1n << 48n) - 1n).toString(), nonce: '0' }, spender, sigDeadline: ((1n << 48n) - 1n).toString(), ...extra },
});
const CLAIM_PAGE = 'Claim your airdrop\nSign once to verify eligibility. No gas. No approval.\nNetwork Sepolia Testnet';
test('unlimited Permit2 signature to an unseen spender is flagged twice', () => {
  const a = analyze({ requests: [{ method: 'eth_signTypedData_v4', walletChainId: 11155111, account: ME, pageText: CLAIM_PAGE, params: [ME, permit2((1n << 160n) - 1n, BAD)] }] });
  assert.equal(a.verdict, 'unsafe');
  assert.ok(ids(a).includes('UNLIMITED_APPROVAL_HIDDEN'));
  assert.ok(ids(a).includes('SPENDER_NOT_SHOWN'));
  assert.ok(a.findings.find((f) => f.id === 'SPENDER_NOT_SHOWN').severity === 'high');
  assert.ok(ids(a).includes('PERMIT_LONG_LIVED'));
});
test('finite Permit2 whose spender and amount are on screen is safe', () => {
  const page = `${CLAIM_PAGE}\nSpender ${ROUTER}\nAllowance 25.00 USDC`;
  const a = analyze({ requests: [{ method: 'eth_signTypedData_v4', walletChainId: 11155111, account: ME, pageText: page, params: [ME, permit2(25_000_000n, ROUTER, { sigDeadline: '9999999999' }).replace(/"expiration":"[0-9]+"/, '"expiration":"9999999999"')] }] });
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
});

const hex = (s) => '0x' + Buffer.from(s, 'utf8').toString('hex');
test('personal_sign of an opaque 32-byte hash is a blind signature', () => {
  const blob = '0x' + '00ff'.repeat(16);
  const a = analyze({ requests: [{ method: 'personal_sign', walletChainId: 1, account: ME, pageText: 'Verify your wallet', params: [blob, ME] }] });
  assert.equal(a.verdict, 'unsafe');
  assert.ok(ids(a).includes('BLIND_SIGNATURE'));
});
test('eth_sign is always a blind signature', () => {
  const a = analyze({ requests: [{ method: 'eth_sign', walletChainId: 1, account: ME, pageText: 'Sign in', params: [ME, hex('hello')] }] });
  assert.ok(ids(a).includes('BLIND_SIGNATURE'));
});
test('readable message that is shown on screen is safe', () => {
  const msg = 'Vegga Airdrop\nVerify wallet\nNonce: 48213';
  const a = analyze({ requests: [{ method: 'personal_sign', walletChainId: 1, account: ME, pageText: 'Message to sign:\nVegga Airdrop\nVerify wallet\nNonce: 48213', params: [hex(msg), ME] }] });
  assert.equal(a.verdict, 'safe', JSON.stringify(a.findings));
});
test('readable message that is NOT shown is only a warning', () => {
  const a = analyze({ requests: [{ method: 'personal_sign', walletChainId: 1, account: ME, pageText: 'Click to continue', params: [hex('Transfer everything'), ME] }] });
  assert.equal(a.verdict, 'safe');
  assert.ok(ids(a).includes('SIGN_MESSAGE_NOT_SHOWN'));
});

const nftReq = (page, approved = true) => ({ method: 'eth_sendTransaction', walletChainId: 1, account: ME, pageText: page, params: [{ to: '0x' + '9'.repeat(40), data: '0xa22cb465' + w(ROUTER) + w(approved ? 1n : 0n) }] });
test('hidden approve-all for NFTs is flagged', () => {
  assert.ok(ids(analyze({ requests: [nftReq('List your NFT for sale on Mainnet\nSpender ' + ROUTER)] })).includes('NFT_APPROVAL_FOR_ALL_HIDDEN'));
});
test('disclosed approve-all for NFTs is only a warning', () => {
  const a = analyze({ requests: [nftReq('Approve all of your NFTs for the marketplace on Mainnet\nSpender ' + ROUTER)] });
  assert.ok(ids(a).includes('NFT_APPROVAL_FOR_ALL'));
  assert.equal(a.verdict, 'safe');
});
