# Vegga

**Prove that what a dapp shows is what its users sign.**

A dapp can show "Pay 25 USDC to 0xA11c…" while the wallet is asked to sign a different recipient, a bigger amount,
an unlimited approval, another chain, or hidden ETH. Unit tests and "the page looks right" never see it. Vegga does:

1. **Kane CLI** drives the dapp's real UI in Chrome from a plain-English objective and stores what the screen claims.
2. A **test wallet** (an injected EIP-1193 / EIP-6963 provider, no popups) records every signing request and, at that
   exact moment, snapshots the page text and a screenshot.
3. The **analyzer** decodes the transaction or signature and compares it with the screen and with Kane's stored values.
4. Verdict per flow: `safe`, `unsafe` or `inconclusive`, with evidence. A coding agent fixes the dapp from
   `evidence/FIX_PROMPT.md`, then Kane re-runs the same flows.

Live site: the landing page (`/`) and the evidence dashboard (`/dashboard/`) are static files, deployable on Vercel as is.

## What it catches

| Finding | Meaning |
|---|---|
| `RECIPIENT_MISMATCH` | Signed recipient is not on screen (names the closest lookalike that is) |
| `AMOUNT_MISMATCH` | Signed amount does not appear on screen (wrong decimals or units) |
| `UNLIMITED_APPROVAL_HIDDEN` | `approve` / `permit` / Permit2 for an unlimited allowance while the screen shows less or nothing |
| `SPENDER_NOT_SHOWN` | Access granted to an address the screen never shows (high for off-chain signatures) |
| `NETWORK_MISMATCH` | Signature or transaction targets a different chain than the screen says |
| `HIDDEN_NATIVE_VALUE` | ETH is attached and never mentioned |
| `BLIND_SIGNATURE` | `eth_sign`, or `personal_sign` over bytes no person can read |
| `SLIPPAGE_UNPROTECTED`, `MIN_RECEIVED_MISMATCH` | Swap accepts any price, or its minimum differs from the screen |
| `SWAP_OUTPUT_REDIRECTED` | Swap pays someone other than the connected wallet |
| `TOKEN_SYMBOL_MISMATCH` | Screen says one token, contract is another |
| `NFT_APPROVAL_FOR_ALL_HIDDEN` | Approve-all for a collection behind single-item wording |
| `AGENT_*` | Kane read a value off the screen that disagrees with what was signed |
| warnings | `RECIPIENT_ONLY_TRUNCATED`, `UNLIMITED_APPROVAL` (disclosed), `PERMIT_LONG_LIVED`, `TOKEN_UNRECOGNIZED`, `SIGN_MESSAGE_NOT_SHOWN`, `TYPED_VALUE_NOT_SHOWN` |

## Demo dapps (each ships flawed on purpose)

| Path | What it is | Planted defects |
|---|---|---|
| `/fixture-before/` | Invoice payments, as first shipped | recipient, decimals, unlimited approval, network, hidden ETH |
| `/fixture/` | The same dapp after an agent fixed it from Kane's evidence | none |
| `/fixture-defi/swap/` | USDC to DAI swap | zero slippage, redirected output, wrong output token |
| `/fixture-defi/claim/` | "No gas, no approval" airdrop | blind signature, unlimited Permit2 for an unseen spender |

For the DeFi pages, `?bugs=none` shows the fixed behavior.

## Run it

```bash
npm test                                  # unit tests + real-browser tests (browser tests skip without Chrome)
npm start                                 # http://localhost:4173/   dashboard: /dashboard/

npm install -g @testmuai/kane-cli
kane-cli login                            # claim your free credits first

# Invoice dapp, round 1 (shipped) then round 2 (fixed)
node scripts/vegga.mjs verify --label round-1-shipped --headless --url http://localhost:4173/fixture-before/
node scripts/vegga.mjs verify --label round-2-fixed   --headless --url http://localhost:4173/fixture/

# DeFi dapps
node scripts/vegga.mjs verify --scenarios scenarios/defi.json --label round-3-defi-shipped --headless --url http://localhost:4173/fixture-defi/
node scripts/vegga.mjs verify --scenarios scenarios/defi.json --label round-4-defi-fixed   --headless --url "http://localhost:4173/fixture-defi/?bugs=none"
```

Results go to `evidence/report.json` and `evidence/shots/`; failures also write `evidence/FIX_PROMPT.md` for a coding agent.
Open `/dashboard/` for the rounds. `/dashboard/#round-1-shipped` deep-links to a round.

`--dry` prints the exact `kane-cli` commands. `--driver script` swaps Kane for a deterministic no-AI driver that only
works on the bundled demo dapps; it exists to test Vegga itself without spending credits, and the dashboard labels such
rounds as "scripted smoke driver".

## Point it at your own dapp

```bash
node scripts/vegga.mjs verify --url https://your-dapp.xyz --label mine \
  --objective "Go to {url}. Choose the 'Vegga Test Wallet' wallet. Enter 25 USDC and recipient 0x… . Before confirming, store the recipient shown as 'ui_recipient', the amount as 'ui_amount' and the network as 'ui_network'. Use exactly these variable names. Confirm every step until the app says it is done. There is no wallet popup." \
  --token 0xYourToken:SYMBOL:6 --abi my-abi.json
```

- Kane stores `ui_recipient`, `ui_amount`, `ui_network`, `ui_approval_amount`, `ui_min_received`; common renamings are mapped.
- `--abi` takes `{ "12345678": { "name": "deposit", "inputs": [["token","address"],["recipient","address"],["amount","uint256"]] } }`
  for your own contract functions (static types: address, uintN, bool, bytes32).
- `--rpc <url>` lets the test wallet forward read calls it does not know to a public RPC.

## How the wallet gets into Kane's browser

Vegga launches Chrome with a debugging port, injects the test wallet over CDP before any page script runs, and starts
Kane with `kane-cli run --cdp-endpoint http://127.0.0.1:9333`. Chrome allows several CDP clients, so Vegga records
signing requests while Kane drives the page.

## Limits

- The test wallet auto-confirms and never broadcasts. It models connect, switch/add chain, allowance reads,
  `eth_sendTransaction`, `personal_sign`, `eth_sign` and `eth_signTypedData*`. Other methods fail unless `--rpc` is given.
- Screen matching reads the page's visible text at signing time. It cannot see text drawn in a canvas or inside
  cross-origin iframes. A dapp that never shows a value will be flagged for it.
- Decoding covers ERC-20 calls, `setApprovalForAll`, Uniswap-V2-style `swapExactTokensForTokens`, Permit / Permit2 typed
  data, and anything you register with `--abi`. Unknown calls are listed but not judged.
- Token identity uses a small built-in registry (USDC, USDT, DAI, WETH); add more with `--token`.
- A passing run means the checked flows did not show these mismatches. It is not a security audit.

## Layout

```
index.html     landing page            dashboard/   rounds, screen-vs-signed diff, signing-moment screenshots
harness/       inject.js (test wallet), cdp.js (Chrome + recorder), decode.js, analyze.js, kane.js, script-driver.js
fixture/, fixture-before/   invoice demo dapp (fixed / as shipped)
fixture-defi/  swap and airdrop demo dapps
scenarios/     Kane objectives (fixture.json, defi.json)
scripts/       vegga.mjs (CLI), server.mjs (static server)
tests/         analyzer, threat and real-browser tests
```
