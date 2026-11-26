// Decode what a dapp asked the wallet to sign: ERC-20 calls, Uniswap-V2-style swaps, Permit/Permit2 typed data,
// plain messages. Static ABI types (address, uintN, bool, bytes32) plus the swap path array.
export const MAX_UINT256 = (1n << 256n) - 1n;
export const UNLIMITED_THRESHOLD = 1n << 128n; // anything this large is "unlimited" in practice (Permit2 uses 2^160 - 1)

const SELECTORS = {
  a9059cbb: { name: 'transfer', inputs: [['to', 'address'], ['amount', 'uint256']] },
  '095ea7b3': { name: 'approve', inputs: [['spender', 'address'], ['amount', 'uint256']] },
  '23b872dd': { name: 'transferFrom', inputs: [['from', 'address'], ['to', 'address'], ['amount', 'uint256']] },
  '39509351': { name: 'increaseAllowance', inputs: [['spender', 'address'], ['amount', 'uint256']] },
  a22cb465: { name: 'setApprovalForAll', inputs: [['operator', 'address'], ['approved', 'bool']] },
  // Vegga demo escrow: deposit(address token, address recipient, uint256 amount)
  '8340f549': { name: 'deposit', inputs: [['token', 'address'], ['recipient', 'address'], ['amount', 'uint256']] },
};

const word = (body, i) => body.slice(i * 64, (i + 1) * 64).padEnd(64, '0');
const addr = (w) => '0x' + w.slice(24);
const big = (w) => BigInt('0x' + w);

// swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
function decodeSwapV2(body) {
  const off = Number(big(word(body, 2))) / 32;
  const len = Number(big(word(body, off)));
  const path = [];
  for (let i = 0; i < len && i < 8; i++) path.push(addr(word(body, off + 1 + i)));
  return {
    kind: 'call', name: 'swapExactTokensForTokens', selector: '38ed1739',
    args: { amount: big(word(body, 0)), amountOutMin: big(word(body, 1)), path, to: addr(word(body, 3)), deadline: big(word(body, 4)), token: path[0] },
  };
}

/** Add your own dapp's functions: registry = { '12345678': { name, inputs: [[argName, type], ...] } } */
export function decodeCall(data, registry = {}) {
  if (!data || data === '0x') return { kind: 'native', name: 'native transfer', selector: null, args: {} };
  const hex = String(data).slice(2).toLowerCase();
  const selector = hex.slice(0, 8);
  const body = hex.slice(8);
  if (selector === '38ed1739') return decodeSwapV2(body);
  const spec = { ...SELECTORS, ...registry }[selector];
  if (!spec) return { kind: 'unknown', name: `unknown(0x${selector})`, selector, args: {} };
  const args = {};
  spec.inputs.forEach(([n, t], i) => {
    const w = word(body, i);
    if (t === 'address') args[n] = addr(w);
    else if (t === 'bool') args[n] = big(w) !== 0n;
    else args[n] = big(w);
  });
  return { kind: 'call', name: spec.name, selector, args };
}

export const recipientOf = (c) => c?.args?.recipient ?? c?.args?.to ?? null;
export const amountOf = (c) => c?.args?.amount ?? null;
export const spenderOf = (c) => c?.args?.spender ?? c?.args?.operator ?? null;

const toBig = (v) => { try { return v === undefined || v === null || v === '' ? 0n : BigInt(v); } catch { return 0n; } };
const bytesOf = (hexOrText) => {
  const s = String(hexOrText ?? '');
  return /^0x[0-9a-fA-F]*$/.test(s) ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8');
};
// leaf values of a typed-data message, as strings
const leaves = (v, out = []) => {
  if (v === null || v === undefined) return out;
  if (typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out));
  else out.push(String(v));
  return out;
};

/** req = { method, params, walletChainId, account } as recorded by the test wallet. */
export function decodeRequest(req, registry = {}) {
  const { method, params = [] } = req;
  if (method === 'eth_sendTransaction') {
    const tx = params[0] || {};
    const call = decodeCall(tx.data, registry);
    const chainId = tx.chainId ? Number(BigInt(tx.chainId)) : req.walletChainId;
    return { type: 'tx', method, to: tx.to || null, value: toBig(tx.value), chainId, call };
  }
  if (method.startsWith('eth_signTypedData')) {
    let td = params[1];
    try { if (typeof td === 'string') td = JSON.parse(td); } catch { td = {}; }
    td = td || {};
    const msg = td.message || {};
    const domain = td.domain || {};
    const chainId = domain.chainId !== undefined ? Number(toBig(domain.chainId)) : req.walletChainId;
    const base = { type: 'typed', method, to: domain.verifyingContract || null, value: 0n, chainId, domainName: domain.name || null };
    const mk = (name, args) => ({ ...base, call: { kind: 'call', name, selector: null, args } });
    if (td.primaryType === 'Permit') return mk('permit', { spender: msg.spender, amount: toBig(msg.value), owner: msg.owner, deadline: toBig(msg.deadline) });
    if (td.primaryType === 'PermitSingle') {
      const det = msg.details || {};
      return mk('permit2', { spender: msg.spender, token: det.token, amount: toBig(det.amount), deadline: toBig(det.expiration), sigDeadline: toBig(msg.sigDeadline) });
    }
    if (td.primaryType === 'PermitBatch') {
      const det = (msg.details || [])[0] || {};
      return mk('permit2', { spender: msg.spender, token: det.token, amount: toBig(det.amount), deadline: toBig(det.expiration), sigDeadline: toBig(msg.sigDeadline), batch: (msg.details || []).length });
    }
    if (td.primaryType === 'PermitTransferFrom' || td.primaryType === 'PermitWitnessTransferFrom') {
      const p = msg.permitted || {};
      return mk('permit2', { spender: msg.spender, token: p.token, amount: toBig(p.amount), deadline: toBig(msg.deadline) });
    }
    return { ...base, call: { kind: 'typed', name: td.primaryType || 'typedData', selector: null, args: {}, values: leaves(msg) } };
  }
  // personal_sign(message, account) and eth_sign(account, message)
  const raw = method === 'eth_sign' ? params[1] : params[0];
  const bytes = bytesOf(raw);
  const text = bytes.toString('utf8');
  const printable = text.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFD]/.test(text);
  return {
    type: 'message', method, to: null, value: 0n, chainId: req.walletChainId,
    call: { kind: 'message', name: method, selector: null, args: {} },
    text: printable ? text : '', blind: method === 'eth_sign' || !printable, bytes: bytes.length,
  };
}
