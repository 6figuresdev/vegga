// Compare what the screen said, what the agent (Kane) read, and what the wallet was asked to sign.
import { decodeRequest, recipientOf, amountOf, spenderOf, UNLIMITED_THRESHOLD } from './decode.js';

export const TOKENS = {
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': { symbol: 'USDC', decimals: 6 }, // Circle USDC, Sepolia
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
};
export const CHAINS = {
  1: 'Ethereum Mainnet', 11155111: 'Sepolia Testnet', 8453: 'Base', 84532: 'Base Sepolia',
  137: 'Polygon', 56: 'BNB Chain', 42161: 'Arbitrum', 10: 'Optimism',
};
// Longest phrases first; each match is blanked so "base sepolia" does not also count as "sepolia".
const CHAIN_PHRASES = [
  ['base sepolia', 84532], ['arbitrum', 42161], ['optimism', 10], ['polygon', 137], ['bnb chain', 56], ['bsc', 56],
  ['base mainnet', 8453], ['base network', 8453], ['sepolia', 11155111], ['ethereum mainnet', 1], ['mainnet', 1],
];

export function chainsOnPage(text) {
  let t = ` ${String(text).toLowerCase()} `;
  const found = new Set();
  for (const [phrase, id] of CHAIN_PHRASES) {
    const re = new RegExp(`\\b${phrase}\\b`, 'g');
    if (re.test(t)) { found.add(id); t = t.replace(re, ' '); }
  }
  return found;
}

const canon = (s) => {
  s = String(s).replace(/,/g, '');
  if (!s.includes('.')) return s.replace(/^0+(?=\d)/, '');
  let [i, f] = s.split('.');
  f = f.replace(/0+$/, ''); i = i.replace(/^0+(?=\d)/, '');
  return f ? `${i}.${f}` : i;
};
export const unitsToCanon = (v, d) => {
  const b = 10n ** BigInt(d);
  return canon(d ? `${v / b}.${(v % b).toString().padStart(d, '0')}` : `${v}`);
};
const group = (s) => s.replace(/^(\d+)/, (w) => w.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const prettyUnits = (v, d, sym = '') => `${group(unitsToCanon(v, d))}${sym ? ' ' + sym : ''}`;
export const numbersOnPage = (text) => new Set((String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(canon));

const ADDR = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const SHORT = /(0x[0-9a-fA-F]{2,})\s*(?:…|\.{2,3})\s*([0-9a-fA-F]{2,})/g;
const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function addressVisibility(addr, text) {
  const a = addr.toLowerCase();
  const originals = String(text).match(ADDR) || [];
  const full = originals.map((x) => x.toLowerCase());
  if (full.includes(a)) return { mode: 'full' };
  for (const m of String(text).matchAll(SHORT)) {
    if (a.startsWith(m[1].toLowerCase()) && a.endsWith(m[2].toLowerCase())) return { mode: 'truncated', shown: m[0] };
  }
  const common = (x) => { let p = 0; while (p < 42 && x[p] === a[p]) p++; let s = 0; while (s < 42 && x[41 - s] === a[41 - s]) s++; return p + s; };
  const closest = [...new Set(originals)].sort((x, y) => common(y.toLowerCase()) - common(x.toLowerCase()))[0];
  return { mode: 'absent', closest: closest && common(closest.toLowerCase()) >= 8 ? closest : null };
}

function claimAddressMatches(claim, addr) {
  const a = addr.toLowerCase(); const c = String(claim).trim().toLowerCase();
  const full = c.match(/0x[0-9a-f]{40}/);
  if (full) return full[0] === a;
  const m = /(0x[0-9a-f]{2,})\s*(?:…|\.{2,3})\s*([0-9a-f]{2,})/.exec(c);
  return m ? a.startsWith(m[1]) && a.endsWith(m[2]) : null; // null = cannot tell
}
const claimNumber = (s) => { const m = String(s ?? '').match(/\d[\d,]*(?:\.\d+)?/); return m ? canon(m[0]) : null; };
function claimChain(s) { const c = chainsOnPage(s || ''); return c.size === 1 ? [...c][0] : null; }

/**
 * requests: [{ method, params, walletChainId, pageText, shot }]
 * claims:   Kane's stored values, e.g. { ui_recipient, ui_amount, ui_network, ui_approval_amount }
 * opts:     { tokens: {addrLower: {symbol, decimals}}, registry: {selector: spec} }
 */
export function analyze({ requests = [], claims = {}, opts = {} }) {
  const tokens = { ...TOKENS, ...(opts.tokens || {}) };
  const findings = []; const rows = []; const decodedList = [];
  const add = (id, severity, message, source = 'screen') => findings.push({ id, severity, message, source });

  if (!requests.length) {
    add('NO_SIGNING_REQUEST', 'inconclusive', 'The flow never asked the wallet to sign or send anything, so there is nothing to compare. Check that the agent reached the confirm step.');
  }

  requests.forEach((r, idx) => {
    const d = decodeRequest(r, opts.registry);
    const text = r.pageText || '';
    const call = d.call;
    const n = idx + 1;
    const tokenAddr = (call.args.token || (d.type === 'tx' ? d.to : d.to) || '').toLowerCase();
    const token = tokens[tokenAddr] || null;
    const decimals = token ? [token.decimals] : [6, 18, 8, 9];
    const sym = token?.symbol || '';
    const fn = call.kind === 'call' ? call.name : d.method;
    decodedList.push({ n, method: d.method, fn, to: d.to, chainId: d.chainId, valueWei: d.value.toString(), shot: r.shot || null });
    const rowStatus = (ok) => (ok ? 'ok' : 'bad');

    // 1. Recipient
    const rcp = recipientOf(call);
    if (rcp) {
      const v = addressVisibility(rcp, text);
      if (v.mode === 'full') rows.push({ label: `Recipient (${fn})`, shown: rcp, signed: rcp, status: 'ok' });
      else if (v.mode === 'truncated') {
        rows.push({ label: `Recipient (${fn})`, shown: v.shown, signed: rcp, status: 'warn' });
        add('RECIPIENT_ONLY_TRUNCATED', 'warn', `Request #${n} sends to ${rcp}, but the screen only shows a shortened form (${v.shown}). Lookalike addresses can share both ends.`);
      } else {
        rows.push({ label: `Recipient (${fn})`, shown: v.closest || 'not on screen', signed: rcp, status: 'bad' });
        add('RECIPIENT_MISMATCH', 'high', `Request #${n} (${fn}) sends to ${rcp}, which is not on the screen.${v.closest ? ` The closest address shown is ${v.closest}.` : ''}`);
      }
    }
    // 2. Spender / operator
    const sp = spenderOf(call);
    if (sp) {
      const v = addressVisibility(sp, text);
      rows.push({ label: `Spender (${fn})`, shown: v.mode === 'absent' ? 'not on screen' : v.shown || sp, signed: sp, status: v.mode === 'absent' ? 'warn' : 'ok' });
      if (v.mode === 'absent') add('SPENDER_NOT_SHOWN', 'warn', `Request #${n} (${fn}) grants access to ${sp}, which the screen never shows.`);
    }
    // 3. Amount
    const amt = amountOf(call);
    if (amt !== null && amt !== undefined) {
      if (amt >= UNLIMITED_THRESHOLD) {
        const disclosed = /unlimited|infinite|no limit|max(imum)?\b/i.test(text);
        rows.push({ label: `Allowance (${fn})`, shown: disclosed ? 'Unlimited (disclosed)' : numbersFromText(text, claims.ui_approval_amount), signed: 'Unlimited (2^256 − 1)', status: disclosed ? 'warn' : 'bad' });
        if (disclosed) add('UNLIMITED_APPROVAL', 'warn', `Request #${n} (${fn}) asks for an unlimited allowance. The screen mentions it.`);
        else add('UNLIMITED_APPROVAL_HIDDEN', 'high', `Request #${n} (${fn}) asks for an UNLIMITED allowance while the screen shows a finite amount.`);
      } else {
        const nums = numbersOnPage(text);
        const hit = decimals.find((dec) => nums.has(unitsToCanon(amt, dec)));
        const label = call.name === 'approve' || call.name === 'permit' || call.name === 'increaseAllowance' ? 'Allowance' : 'Amount';
        if (hit !== undefined) rows.push({ label: `${label} (${fn})`, shown: prettyUnits(amt, hit, sym), signed: prettyUnits(amt, hit, sym), status: 'ok' });
        else {
          const asDec = decimals.map((dec) => prettyUnits(amt, dec, sym));
          rows.push({ label: `${label} (${fn})`, shown: claims.ui_amount || 'not on screen', signed: `${asDec[0]} (raw ${amt})`, status: 'bad' });
          add('AMOUNT_MISMATCH', 'high', `Request #${n} (${fn}) moves ${asDec[0]}${decimals.length > 1 ? ' (or another decimals reading)' : ''} (raw ${amt}), but that amount is not on the screen.`);
        }
      }
    }
    // 4. Network
    const onPage = chainsOnPage(text);
    const signedChain = d.chainId;
    if (onPage.size && signedChain !== undefined && !onPage.has(signedChain)) {
      rows.push({ label: 'Network', shown: [...onPage].map((c) => CHAINS[c]).join(', '), signed: CHAINS[signedChain] || `chain ${signedChain}`, status: 'bad' });
      add('NETWORK_MISMATCH', 'high', `Request #${n} would execute on ${CHAINS[signedChain] || 'chain ' + signedChain}, but the screen says ${[...onPage].map((c) => CHAINS[c]).join(' / ')}.`);
    } else if (signedChain !== undefined) {
      rows.push({ label: 'Network', shown: onPage.size ? [...onPage].map((c) => CHAINS[c]).join(', ') : 'not stated', signed: CHAINS[signedChain] || `chain ${signedChain}`, status: onPage.size ? 'ok' : 'warn' });
    }
    // 5. Hidden native value
    if (d.value > 0n) {
      const shown = numbersOnPage(text).has(unitsToCanon(d.value, 18));
      rows.push({ label: 'Native value', shown: shown ? prettyUnits(d.value, 18, 'ETH') : 'not on screen', signed: prettyUnits(d.value, 18, 'ETH'), status: shown ? 'ok' : 'bad' });
      if (!shown) add('HIDDEN_NATIVE_VALUE', 'high', `Request #${n} (${fn}) also sends ${prettyUnits(d.value, 18, 'ETH')} of native currency, and the screen never mentions it.`);
    }

    // 6. What the agent (Kane) read off the screen versus what was signed
    if (rcp && claims.ui_recipient) {
      const m = claimAddressMatches(claims.ui_recipient, rcp);
      if (m === false) add('AGENT_RECIPIENT_MISMATCH', 'high', `The agent read the recipient as ${claims.ui_recipient}, but request #${n} signs ${rcp}.`, 'kane');
    }
    if (amt !== null && amt !== undefined && amt < UNLIMITED_THRESHOLD) {
      const key = call.name === 'approve' || call.name === 'permit' ? claims.ui_approval_amount ?? null : claims.ui_amount ?? null;
      const cn = claimNumber(key);
      if (cn !== null && !decimals.some((dec) => unitsToCanon(amt, dec) === cn)) {
        add('AGENT_AMOUNT_MISMATCH', 'high', `The agent read ${call.name === 'approve' ? 'the approval' : 'the amount'} as ${key}, but request #${n} signs ${prettyUnits(amt, decimals[0], sym)}.`, 'kane');
      }
    }
    const cc = claimChain(claims.ui_network);
    if (cc && signedChain !== undefined && cc !== signedChain) {
      add('AGENT_NETWORK_MISMATCH', 'high', `The agent read the network as ${claims.ui_network}, but request #${n} executes on ${CHAINS[signedChain] || signedChain}.`, 'kane');
    }
  });

  const order = { high: 0, inconclusive: 1, warn: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const verdict = findings.some((f) => f.severity === 'high') ? 'unsafe'
    : findings.some((f) => f.severity === 'inconclusive') ? 'inconclusive' : 'safe';
  return { verdict, findings, rows, requests: decodedList };
}

function numbersFromText(text, claim) {
  if (claim) return claim;
  const m = String(text).match(/\d[\d,]*(?:\.\d+)?\s*[A-Z]{3,5}\b/);
  return m ? m[0] : 'a finite amount';
}
