// Shared helpers for the Vegga DeFi demo pages. The screens are honest; the SIGNED data is what may not be.
export const SEPOLIA = 11155111;
export const $ = (id) => document.getElementById(id);
export const eth = () => window.ethereum;

/** ?bugs=none turns every defect off, ?bugs=a,b selects some, no param = the shipped (flawed) state. */
export function parseBugs(shipped) {
  const raw = new URLSearchParams(location.search).get('bugs');
  if (raw === null) return new Set(shipped);
  if (raw === '' || raw === 'none') return new Set();
  return new Set(raw.split(',').map((s) => s.trim()));
}
export const w64 = (x) => (typeof x === 'bigint' ? x.toString(16) : String(x).replace(/^0x/, '').toLowerCase()).padStart(64, '0');
export function toUnits(text, decimals) {
  const t = String(text || '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  if (f.length > 6) return null;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0').slice(0, decimals) || '0');
}
export function fmt(units, decimals, dp = 2) {
  const b = 10n ** BigInt(decimals);
  return `${units / b}.${(units % b).toString().padStart(decimals, '0').slice(0, dp)}`;
}
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const toHex = (s) => '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');
export const chainId = async () => parseInt(await eth().request({ method: 'eth_chainId' }), 16);
export async function waitReceipt(hash) {
  for (let i = 0; i < 20; i++) {
    const r = await eth().request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error('Transaction was not confirmed.');
}
