# Submission notes (Kane CLI Online Hackathon)

## One-liner
Vegga uses Kane CLI to prove that what a dapp shows is what its users sign.

## Problem
Wallet users approve what a dapp's screen tells them. When the screen and the signed transaction disagree
(swapped recipient, wrong decimals, unlimited approval, wrong chain, hidden ETH) no unit test notices and the
user loses funds. AI coding agents now write dapp frontends, which makes this check more necessary, not less.

## Where Kane CLI is essential
- Kane drives the real UI from plain English across any dapp, including wallet-connect steps, with no selectors.
- Kane stores what the screen claims (`ui_recipient`, `ui_amount`, `ui_network`, `ui_approval_amount`) in `final_state`.
- Vegga attaches its test wallet to the same Chrome through `--cdp-endpoint` and compares the claims with the signed payload.
- Loop: Kane finds the mismatch, an agent fixes the dapp from `FIX_PROMPT.md`, Kane re-verifies the same flows.

## Demo video (about 2.5 minutes)
1. 0:00 The problem, in one screen: the dapp says 25 USDC to 0xA11c…, the wallet is asked for something else.
2. 0:25 Run round 1 (`verify --label round-1-shipped`) while Kane drives the browser.
3. 1:00 Dashboard: UNSAFE, the screen-vs-signed table, the signing-moment screenshots.
4. 1:30 Paste `FIX_PROMPT.md` into a coding agent, show the diff.
5. 2:00 Round 2: same flows, safe. Show the before/after strip on the dashboard.
6. 2:20 One real dapp of your own, pointed at with `--objective`, as the closing shot.

## Checklist
- [ ] Claimed the 10,000 free Kane credits before building (the form asks)
- [ ] Round 1 and round 2 produced by Kane (not `--driver script`), reports in `evidence/`
- [ ] Repo public, README renders, demo video linked
- [ ] Submitted before 7pm with buffer
