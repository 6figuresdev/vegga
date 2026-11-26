// Decode what a dapp asked the wallet to sign. Static ABI types only (address, uintN, bool, bytes32).
export const MAX_UINT256 = (1n << 256n) - 1n;
export const UNLIMITED_THRESHOLD = 1n << 128n; // anything this large is "unlimited" in practice

const SELECTORS = {
  a9059cbb: { name: 'transfer', inputs: [['to', 'address'], ['amount', 'uint256']] },
  '095ea7b3': { name: 'approve', inputs: [['spender', 'address'], ['amount', 'uint256']] },
  '23b872dd': { name: 'transferFrom', inputs: [['from', 'address'], ['to', 'address'], ['amount', 'uint256']] },
  '39509351': { name: 'increaseAllowance', inputs: [['spender', 'address'], ['amount', 'uint256']] },
  a22cb465: { name: 'setApprovalForAll', inputs: [['operator', 'address'], ['approved', 'bool']] },
  // Vegga demo escrow: deposit(address token, address recipient, uint256 amount)
  '8340f549': { name: 'deposit', inputs: [['token', 'address'], ['recipient', 'address'], ['amount', 'uint256']] },
};

/** Add your own dapp's functions: registry = { '12345678': { name, inputs: [[argName, type], ...] } } */
export function decodeCall(data, registry = {}) {
  if (!data || data === '0x') return { kind: 'native', name: 'native transfer', selector: null, args: {} };
  const hex = String(data).slice(2).toLowerCase();
  const selector = hex.slice(0, 8);
  const body = hex.slice(8);
  const spec = { ...SELECTORS, ...registry }[selector];
  if (!spec) return { kind: 'unknown', name: `unknown(0x${selector})`, selector, args: {} };
  const args = {};
  spec.inputs.forEach(([n, t], i) => {
    const w = body.slice(i * 64, (i + 1) * 64).padEnd(64, '0');
    if (t === 'address') args[n] = '0x' + w.slice(24);
    else if (t === 'bool') args[n] = BigInt('0x' + w) !== 0n;
    else args[n] = BigInt('0x' + w);
  });
  return { kind: 'call', name: spec.name, selector, args };
}

export const recipientOf = (c) => c?.args?.recipient ?? c?.args?.to ?? null;
export const amountOf = (c) => c?.args?.amount ?? null;
export const spenderOf = (c) => c?.args?.spender ?? c?.args?.operator ?? null;

const toBig = (v) => (v === undefined || v === null || v === '' ? 0n : BigInt(v));
const utf8 = (hex) => { try { return Buffer.from(String(hex).replace(/^0x/, ''), 'hex').toString('utf8'); } catch { return ''; } };

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
    const msg = td?.message || {};
    const domain = td?.domain || {};
    const chainId = domain.chainId !== undefined ? Number(BigInt(domain.chainId)) : req.walletChainId;
    if (td?.primaryType === 'Permit') {
      return {
        type: 'typed', method, to: domain.verifyingContract || null, value: 0n, chainId,
        call: { kind: 'call', name: 'permit', selector: null, args: { spender: msg.spender, amount: toBig(msg.value), owner: msg.owner, deadline: msg.deadline } },
      };
    }
    return { type: 'typed', method, to: domain.verifyingContract || null, value: 0n, chainId, call: { kind: 'typed', name: td?.primaryType || 'typedData', selector: null, args: {} } };
  }
  const text = method === 'personal_sign' ? utf8(params[0]) : '';
  return { type: 'message', method, to: null, value: 0n, chainId: req.walletChainId, call: { kind: 'message', name: method, selector: null, args: {} }, text };
}
