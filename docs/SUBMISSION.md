# Submission notes (Kane CLI Online Hackathon)

## One-liner
Vegga uses Kane CLI to prove that what a dapp shows is what its users sign.

## Problem
Wallet users approve what a dapp's screen tells them. When the screen and the signed payload disagree (swapped
recipient, wrong decimals, unlimited approval, wrong chain, hidden ETH, zero-slippage swaps, "no gas, no approval"
signatures) no unit test notices and the user loses funds. AI coding agents now write dapp frontends, which makes this
check more necessary, not less.

## Where Kane CLI is essential
- Kane drives the real UI from plain English across any dapp, including wallet-connect steps, with no selectors.
- Kane stores what the screen claims (`ui_recipient`, `ui_amount`, `ui_network`, `ui_min_received`) in `final_state`.
- Vegga attaches its test wallet to the same Chrome through `--cdp-endpoint` and compares the claims with the signed payload.
- Loop: Kane finds the mismatch, an agent fixes the dapp from `FIX_PROMPT.md`, Kane re-verifies the same flows.

## What is new
- A screen-versus-signature check, not a UI test: it records the signing request and the screen at that exact moment.
- 12 mismatch classes across ERC-20, swaps, Permit/Permit2 and blind signatures, with a screenshot as evidence.
- Four demo dapps with planted defects and a before/after loop, plus a one-line objective to point at your own dapp.

## Demo video (about 3 minutes)
1. 0:00 The hook: "The screen said 25 USDC. The wallet signed 25 trillion." Show the landing page card.
2. 0:20 Run round 1 on the invoice dapp while Kane drives the browser.
3. 1:00 Dashboard `#round-1-shipped`: the red characters, the screenshots, the findings.
4. 1:30 Give `FIX_PROMPT.md` to a coding agent, show the diff. Round 2: safe.
5. 2:10 DeFi round: swap with zero slippage and the "no gas, no approval" Permit2.
6. 2:40 Close on `/dashboard/` with all rounds and the one-line objective for your own dapp.

## Checklist
- [ ] Claimed the 10,000 free Kane credits before building (the form asks)
- [ ] Rounds produced by Kane (not `--driver script`), reports and screenshots in `evidence/`
- [ ] Repo public, README renders, live site and demo video linked
- [ ] Submitted before 7pm with buffer
