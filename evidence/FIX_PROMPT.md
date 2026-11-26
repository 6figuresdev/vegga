# Vegga: what the dapp showed is not what it asked users to sign

Kane CLI drove the real UI while a test wallet recorded every signing request. Fix the DAPP. Do not edit the harness or scenarios.

## SG-03 · Swap 25 USDC for DAI (unsafe)
- **RECIPIENT_MISMATCH**: Request #3 (swapExactTokensForTokens) sends to 0xbad0000000000000000000000000000000000bad, which is not on the screen.
- **SLIPPAGE_UNPROTECTED**: Request #3 accepts ANY output amount (minimum received is 0) while the screen promises 24.75 DAI. A sandwich attack can take nearly everything.
- **SWAP_OUTPUT_REDIRECTED**: Request #3 sends the swap output to 0xbad0000000000000000000000000000000000bad, not to the connected wallet 0xBEEF00000000000000000000000000000000BEEF.
- **TOKEN_SYMBOL_MISMATCH**: Request #3 (swapExactTokensForTokens) involves USDT (0xdac17f958d2ee523a2206206994597c13d831ec7), but the screen only mentions USDC, DAI.
- **AGENT_RECIPIENT_MISMATCH**: The agent read the recipient as 0xBEEF00000000000000000000000000000000BEEF, but request #3 signs 0xbad0000000000000000000000000000000000bad.
- **RECIPIENT_MISMATCH**: Request #4 (swapExactTokensForTokens) sends to 0xbad0000000000000000000000000000000000bad, which is not on the screen.
- **SLIPPAGE_UNPROTECTED**: Request #4 accepts ANY output amount (minimum received is 0) while the screen promises 24.75 DAI. A sandwich attack can take nearly everything.
- **SWAP_OUTPUT_REDIRECTED**: Request #4 sends the swap output to 0xbad0000000000000000000000000000000000bad, not to the connected wallet 0xBEEF00000000000000000000000000000000BEEF.
- **TOKEN_SYMBOL_MISMATCH**: Request #4 (swapExactTokensForTokens) involves USDT (0xdac17f958d2ee523a2206206994597c13d831ec7), but the screen only mentions USDC, DAI.
- **AGENT_RECIPIENT_MISMATCH**: The agent read the recipient as 0xBEEF00000000000000000000000000000000BEEF, but request #4 signs 0xbad0000000000000000000000000000000000bad.

## SG-04 · Claim the airdrop (unsafe)
- **BLIND_SIGNATURE**: Request #1 (personal_sign) asks to sign 32 bytes of opaque data that no person can read. A blind signature can authorise anything.
- **BLIND_SIGNATURE**: Request #2 (personal_sign) asks to sign 32 bytes of opaque data that no person can read. A blind signature can authorise anything.
- **SPENDER_NOT_SHOWN**: Request #3 (permit2) grants access to 0xBAD0000000000000000000000000000000000BAD, which the screen never shows. This is a signature, so nothing appears as a transaction in the wallet.
- **UNLIMITED_APPROVAL_HIDDEN**: Request #3 (permit2) asks for an UNLIMITED allowance while the screen shows no allowance at all.
- **SPENDER_NOT_SHOWN**: Request #4 (permit2) grants access to 0xBAD0000000000000000000000000000000000BAD, which the screen never shows. This is a signature, so nothing appears as a transaction in the wallet.
- **UNLIMITED_APPROVAL_HIDDEN**: Request #4 (permit2) asks for an UNLIMITED allowance while the screen shows no allowance at all.

When done run: node scripts/vegga.mjs verify --label <next-round> --url http://localhost:4173/fixture-defi/