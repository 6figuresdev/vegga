# Vegga: what the dapp showed is not what it asked users to sign

Kane CLI drove the real UI while a test wallet recorded every signing request. Fix the DAPP. Do not edit the harness or scenarios.

## SG-01 · Pay a 25 USDC invoice (unsafe)
- **UNLIMITED_APPROVAL_HIDDEN**: Request #1 (approve) asks for an UNLIMITED allowance while the screen shows a finite amount.
- **NETWORK_MISMATCH**: Request #1 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **AGENT_NETWORK_MISMATCH**: The agent read the network as Sepolia Testnet, but request #1 executes on Ethereum Mainnet.
- **UNLIMITED_APPROVAL_HIDDEN**: Request #2 (approve) asks for an UNLIMITED allowance while the screen shows a finite amount.
- **NETWORK_MISMATCH**: Request #2 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **AGENT_NETWORK_MISMATCH**: The agent read the network as Sepolia Testnet, but request #2 executes on Ethereum Mainnet.
- **RECIPIENT_MISMATCH**: Request #3 (deposit) sends to 0xa11ce5b0b1234567890abcdef1234567890abcd0, which is not on the screen. The closest address shown is 0xA11ce5B0b1234567890aBcDeF1234567890aBcDe.
- **AMOUNT_MISMATCH**: Request #3 (deposit) moves 25,000,000,000,000 USDC (raw 25000000000000000000), but that amount is not on the screen.
- **NETWORK_MISMATCH**: Request #3 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **HIDDEN_NATIVE_VALUE**: Request #3 (deposit) also sends 0.05 ETH of native currency, and the screen never mentions it.
- **AGENT_RECIPIENT_MISMATCH**: The agent read the recipient as 0xA11ce5B0b1234567890aBcDeF1234567890aBcDe, but request #3 signs 0xa11ce5b0b1234567890abcdef1234567890abcd0.
- **AGENT_AMOUNT_MISMATCH**: The agent read the amount as 25.00 USDC, but request #3 signs 25,000,000,000,000 USDC.
- **AGENT_NETWORK_MISMATCH**: The agent read the network as Sepolia Testnet, but request #3 executes on Ethereum Mainnet.
- **RECIPIENT_MISMATCH**: Request #4 (deposit) sends to 0xa11ce5b0b1234567890abcdef1234567890abcd0, which is not on the screen. The closest address shown is 0xA11ce5B0b1234567890aBcDeF1234567890aBcDe.
- **AMOUNT_MISMATCH**: Request #4 (deposit) moves 25,000,000,000,000 USDC (raw 25000000000000000000), but that amount is not on the screen.
- **NETWORK_MISMATCH**: Request #4 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **HIDDEN_NATIVE_VALUE**: Request #4 (deposit) also sends 0.05 ETH of native currency, and the screen never mentions it.
- **AGENT_RECIPIENT_MISMATCH**: The agent read the recipient as 0xA11ce5B0b1234567890aBcDeF1234567890aBcDe, but request #4 signs 0xa11ce5b0b1234567890abcdef1234567890abcd0.
- **AGENT_AMOUNT_MISMATCH**: The agent read the amount as 25.00 USDC, but request #4 signs 25,000,000,000,000 USDC.
- **AGENT_NETWORK_MISMATCH**: The agent read the network as Sepolia Testnet, but request #4 executes on Ethereum Mainnet.

## SG-02 · Pay a 7.50 USDC invoice (unsafe)
- **UNLIMITED_APPROVAL_HIDDEN**: Request #1 (approve) asks for an UNLIMITED allowance while the screen shows a finite amount.
- **NETWORK_MISMATCH**: Request #1 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **UNLIMITED_APPROVAL_HIDDEN**: Request #2 (approve) asks for an UNLIMITED allowance while the screen shows a finite amount.
- **NETWORK_MISMATCH**: Request #2 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **RECIPIENT_MISMATCH**: Request #3 (deposit) sends to 0x7e57ed0000000000000000000000000000c0ffe0, which is not on the screen. The closest address shown is 0x7e57ed0000000000000000000000000000c0ffee.
- **AMOUNT_MISMATCH**: Request #3 (deposit) moves 7,500,000,000,000 USDC (raw 7500000000000000000), but that amount is not on the screen.
- **NETWORK_MISMATCH**: Request #3 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **HIDDEN_NATIVE_VALUE**: Request #3 (deposit) also sends 0.05 ETH of native currency, and the screen never mentions it.
- **RECIPIENT_MISMATCH**: Request #4 (deposit) sends to 0x7e57ed0000000000000000000000000000c0ffe0, which is not on the screen. The closest address shown is 0x7e57ed0000000000000000000000000000c0ffee.
- **AMOUNT_MISMATCH**: Request #4 (deposit) moves 7,500,000,000,000 USDC (raw 7500000000000000000), but that amount is not on the screen.
- **NETWORK_MISMATCH**: Request #4 would execute on Ethereum Mainnet, but the screen says Sepolia Testnet.
- **HIDDEN_NATIVE_VALUE**: Request #4 (deposit) also sends 0.05 ETH of native currency, and the screen never mentions it.

When done run: node scripts/vegga.mjs verify --label <next-round> --url http://localhost:4173/fixture/