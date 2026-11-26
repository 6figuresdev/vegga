// Vegga test wallet. Injected into every page at document start (via CDP, before the dapp's own scripts).
// It is an EIP-1193 provider (also announced via EIP-6963) that never shows a popup. It auto-confirms,
// returns a fake hash, and reports every signing request to the harness through the __vegga_report binding.
(() => {
  if (window.__vegga_installed) return;
  window.__vegga_installed = true;
  const CFG = Object.assign({
    account: '0xBEEF' + '0'.repeat(32) + 'BEEF',
    chainId: 1, // starts on Ethereum Mainnet on purpose: the dapp must ask to switch
    confirmDelayMs: 700, // time the "user" takes to review; the harness snapshots the screen in this window
    chains: [1, 11155111, 8453, 84532, 137, 56, 42161, 10, 43114],
    rpc: null,
  }, globalThis.__VEGGA_CFG || {});

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hex = (n) => '0x' + BigInt(n).toString(16);
  const rnd = (n) => '0x' + Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
  const word = (v) => BigInt(v).toString(16).padStart(64, '0');
  const err = (code, message) => Object.assign(new Error(message), { code });
  const report = (kind, data) => {
    try { window.__vegga_report(JSON.stringify({ kind, href: location.href, ...data })); } catch (e) { /* binding missing */ }
  };

  const state = { chainId: CFG.chainId, accounts: [], listeners: {}, receipts: {}, allowances: {} };
  const emit = (ev, arg) => (state.listeners[ev] || []).slice().forEach((fn) => { try { fn(arg); } catch (e) {} });
  const SIGN = new Set(['eth_sendTransaction', 'eth_signTransaction', 'personal_sign', 'eth_sign',
    'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4']);

  function trackApproval(tx) {
    const d = String(tx.data || '').toLowerCase();
    if (d.startsWith('0x095ea7b3') && tx.to) {
      const spender = '0x' + d.slice(34, 74);
      const amount = BigInt('0x' + (d.slice(74, 138) || '0'));
      state.allowances[`${tx.to.toLowerCase()}:${(tx.from || CFG.account).toLowerCase()}:${spender}`] = amount;
    }
  }
  function ethCall(p) {
    const to = String(p.to || '').toLowerCase(); const d = String(p.data || '').toLowerCase();
    if (d.startsWith('0xdd62ed3e')) { // allowance(owner, spender)
      const owner = '0x' + d.slice(34, 74); const spender = '0x' + d.slice(98, 138);
      return '0x' + word(state.allowances[`${to}:${owner}:${spender}`] || 0n);
    }
    if (d.startsWith('0x70a08231')) return '0x' + word(10n ** 12n); // balanceOf: 1,000,000 units at 6 decimals
    if (d.startsWith('0x313ce567')) return '0x' + word(6); // decimals()
    return '0x' + word(0);
  }

  async function request(args) {
    const method = args && args.method; const params = (args && args.params) || [];
    if (SIGN.has(method)) {
      report('sign_request', { method, params, walletChainId: state.chainId, account: CFG.account });
      await sleep(CFG.confirmDelayMs);
      if (method === 'eth_sendTransaction') {
        const tx = params[0] || {}; trackApproval(tx);
        const h = rnd(32);
        state.receipts[h] = {
          transactionHash: h, status: '0x1', blockNumber: '0x10', blockHash: rnd(32), transactionIndex: '0x0',
          from: tx.from || CFG.account, to: tx.to || null, gasUsed: '0x5208', cumulativeGasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00', logs: [], logsBloom: '0x' + '0'.repeat(512), type: '0x2', contractAddress: null,
        };
        return h;
      }
      return '0x' + 'ab'.repeat(65);
    }
    switch (method) {
      case 'eth_requestAccounts':
        state.accounts = [CFG.account]; emit('accountsChanged', state.accounts); emit('connect', { chainId: hex(state.chainId) });
        report('connect', { account: CFG.account }); return [CFG.account];
      case 'eth_accounts': return state.accounts.slice();
      case 'eth_chainId': return hex(state.chainId);
      case 'net_version': return String(state.chainId);
      case 'wallet_switchEthereumChain': {
        const id = Number(BigInt(params[0].chainId));
        if (!CFG.chains.includes(id)) throw err(4902, 'Unrecognized chain ID. Try adding the chain first.');
        state.chainId = id; emit('chainChanged', hex(id)); report('switch_chain', { chainId: id }); return null;
      }
      case 'wallet_addEthereumChain': {
        const id = Number(BigInt(params[0].chainId));
        if (!CFG.chains.includes(id)) CFG.chains.push(id);
        state.chainId = id; emit('chainChanged', hex(id)); return null;
      }
      case 'wallet_getPermissions': case 'wallet_requestPermissions': return [{ parentCapability: 'eth_accounts' }];
      case 'eth_blockNumber': return '0x10';
      case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return '0x3b9aca00';
      case 'eth_estimateGas': return '0x30d40';
      case 'eth_getBalance': return '0x' + (10n ** 20n).toString(16);
      case 'eth_getTransactionCount': return '0x1';
      case 'eth_getTransactionReceipt': return state.receipts[params[0]] || null;
      case 'eth_getTransactionByHash': return state.receipts[params[0]] ? { hash: params[0], blockNumber: '0x10' } : null;
      case 'eth_call': return ethCall(params[0] || {});
      default:
        if (CFG.rpc) {
          const res = await fetch(CFG.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
          const j = await res.json(); if (j.error) throw err(j.error.code, j.error.message); return j.result;
        }
        report('unsupported', { method });
        throw err(4200, `Vegga test wallet does not support ${method}`);
    }
  }

  const provider = {
    isVegga: true,
    request,
    on(ev, fn) { (state.listeners[ev] ||= []).push(fn); return provider; },
    addListener(ev, fn) { return provider.on(ev, fn); },
    removeListener(ev, fn) { state.listeners[ev] = (state.listeners[ev] || []).filter((f) => f !== fn); return provider; },
    off(ev, fn) { return provider.removeListener(ev, fn); },
    enable() { return request({ method: 'eth_requestAccounts' }); },
    get chainId() { return hex(state.chainId); },
    get selectedAddress() { return state.accounts[0] || null; },
    isConnected() { return true; },
  };

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="#2750f0"/></svg>';
  const info = { uuid: '7d2b6f64-3c1e-4a55-9a0d-5e6a0e11e7a1', name: 'Vegga Test Wallet', icon: 'data:image/svg+xml;base64,' + btoa(svg), rdns: 'dev.vegga.testwallet' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
  try { Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: true }); } catch (e) { window.ethereum = provider; }
  window.__vegga = { provider, state };
})();
