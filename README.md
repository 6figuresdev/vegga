# Vegga

**Verify that what your dapp shows is what your users sign.**

A dapp can display "Pay 25 USDC to 0xA11c…" while the wallet is asked to sign a different recipient, a bigger
amount, an unlimited approval, another chain or hidden ETH. Unit tests and "the page looks right" never see it.
Vegga does:

1. **Kane CLI** drives the dapp's real UI in Chrome from a plain-English objective and stores what the screen claims.
2. A **test wallet** (an injected EIP-1193 / EIP-6963 provider, no popups) records every signing request and, at that
   exact moment, snapshots the page text and a screenshot.
3. The **analyzer** decodes the calldata (or Permit typed data) and compares it with the screen and with Kane's stored values.
4. Verdict per flow: `safe`, `unsafe` or `inconclusive`, with evidence. A coding agent fixes the dapp from
   `evidence/FIX_PROMPT.md`, then Kane re-runs the same flows.

| Finding | Meaning |
|---|---|
| `RECIPIENT_MISMATCH` | Signed recipient is not on screen (shows the closest lookalike that is) |
| `AMOUNT_MISMATCH` | Signed amount does not appear on screen (wrong decimals, wrong units) |
| `UNLIMITED_APPROVAL_HIDDEN` | `approve`/`permit` for an unlimited allowance while the screen shows a finite one |
| `NETWORK_MISMATCH` | Transaction would run on a different chain than the screen says |
| `HIDDEN_NATIVE_VALUE` | ETH is attached to the transaction and never mentioned |
| `AGENT_*` | Kane read a value off the screen that disagrees with what was signed |
| `RECIPIENT_ONLY_TRUNCATED`, `SPENDER_NOT_SHOWN`, `UNLIMITED_APPROVAL` | Warnings (not failures) |

## Try it on the bundled demo dapp

`fixture/` is "Vegga Escrow", a small invoice-payment dapp written the way a coding agent might ship it. Its screen is
correct, but it ships five defects in what it asks the wallet to sign (one per finding above).

```bash
npm test                                  # 11 unit tests + 2 real-browser tests (browser tests skip without Chrome)
npm start                                 # demo dapp: http://localhost:4173/fixture/   dashboard: /dashboard/

npm install -g @testmuai/kane-cli
kane-cli login                            # claim your free credits first

# Round 1: the shipped build. Expect UNSAFE with every defect named.
node scripts/vegga.mjs verify --label round-1-shipped
# -> evidence/report.json, evidence/shots/*.png, evidence/FIX_PROMPT.md

# Give evidence/FIX_PROMPT.md to your coding agent (Claude Code, Cursor, Codex...).
# To fix a defect: remove its id from SHIPPED_BUGS in fixture/app.js and delete its `bugOn('<id>')` branch.

# Round 2: same flows, fixed build. Expect safe.
node scripts/vegga.mjs verify --label round-2-fixed
```

Open `http://localhost:4173/dashboard/` for the rounds side by side. Quick manual look at both builds:
`/fixture/` (shipped, buggy) and `/fixture/?bugs=none` (fixed).

`--dry` prints the exact `kane-cli` commands. `--headless` for CI. `--driver script` swaps Kane for a deterministic
no-AI driver that only works on the bundled demo; it exists to test Vegga itself without spending credits.

## Point it at your own dapp

```bash
node scripts/vegga.mjs verify --url https://your-dapp.xyz --label mine \
  --objective "Go to {url}. Choose the 'Vegga Test Wallet' wallet. Enter 25 USDC and recipient 0x… . Before confirming, store the recipient shown as 'ui_recipient', the amount as 'ui_amount' and the network as 'ui_network'. Confirm every step until the app says it is done. There is no wallet popup." \
  --token 0xYourToken:SYMBOL:6 --abi my-abi.json
```

- Kane stores values named `ui_recipient`, `ui_amount`, `ui_network`, `ui_approval_amount`; the analyzer compares them.
- `--abi` takes `{ "12345678": { "name": "deposit", "inputs": [["token","address"],["recipient","address"],["amount","uint256"]] } }`
  for your own contract functions (static types: address, uintN, bool, bytes32).
- `--rpc <url>` lets the test wallet forward read calls it does not know to a public RPC.

## How the wallet gets into Kane's browser

Vegga launches Chrome with a debugging port, injects the test wallet over CDP before any page script runs, and starts
Kane with `kane-cli run --cdp-endpoint http://127.0.0.1:9333`. Chrome allows several CDP clients, so Vegga records
signing requests while Kane drives the page.

## Limits

- The test wallet auto-confirms and never broadcasts. It models connect, switch/add chain, allowance reads,
  `eth_sendTransaction`, `personal_sign` and `eth_signTypedData*`. Other methods fail unless `--rpc` is given.
- Screen matching reads the page's visible text at signing time. It cannot see text drawn in a canvas or inside
  cross-origin iframes. A dapp that never shows a value will be flagged for it.
- Calldata decoding covers ERC-20 `transfer`, `approve`, `transferFrom`, `increaseAllowance`, `setApprovalForAll`,
  Permit typed data and anything you register with `--abi`. Unknown calls are listed but not judged.
- A passing run means the checked flows did not show these mismatches. It is not a security audit.

## Layout

```
harness/    inject.js (test wallet), cdp.js (Chrome + recorder), decode.js, analyze.js, kane.js, script-driver.js
fixture/    Vegga Escrow demo dapp with five planted sign-vs-screen defects
scenarios/  Kane objectives for the demo
scripts/    vegga.mjs (CLI), server.mjs (static server)
dashboard/  rounds, screen-vs-signed table, signing-moment screenshots
tests/      analyzer unit tests and real-browser tests
```
