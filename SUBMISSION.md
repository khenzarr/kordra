# Kordra — Arc Microgrants submission

## One-line pitch

Kordra lets a sponsor lock one exact USDC payment and authorize another wallet to release it only to a fixed recipient before a fixed deadline.

## Short description

Kordra is a one-time delegated USDC payment authority for Arc. A sponsor deposits the exact amount and fixes the spender, recipient, and deadline. The designated spender can execute once before expiry; if unused, only the sponsor can reclaim after expiry. It gives companies and individuals a verifiable way to delegate a specific payment without sharing unrestricted wallet access.

## What it demonstrates

- A real business and personal payment need with USDC as the settlement asset.
- Three distinct roles: sponsor, authorized spender, and fixed recipient.
- Immediate onchain escrow, exact authorization, one-time execution, and expiry recovery.
- No admin, fees, proxy, upgrade path, oracle, backend, or partial payments.
- A complete Arc Studio build with contract tests, application, and mainnet evidence.

## Required links

- Live app: https://kordra.vercel.app
- Arc Studio: https://studio.arc.io/app/a34cf66d-02a0-4733-a22b-a28ff3d1efd6
- Public repository: https://github.com/khenzarr/kordra
- Builder profile: https://github.com/khenzarr
- Mainnet contract: https://explorer.arc.io/address/0x526f678937c5acf2d9f6876d00289aee5f3a873f
- Contract deployment: https://explorer.arc.io/tx/0x3365cbf77987ea66e8798444931dbee1b8fbd71bf8f197d86e9e5162e48a6c59
- Example create transaction: https://explorer.arc.io/tx/0xbf5216e063734dd1aed33acd00cc2b8cfb60e7dd3d39920e99c1c890409eac65
- Example execution transaction: https://explorer.arc.io/tx/0x788314a71d133ddf9655287d85f719a5a09b2eebb1fc7cda566b04a1a26061ea
- Video walkthrough: ADD_FINAL_VIDEO_URL

## Verified mainnet result

Instruction #1 locked 0.01 USDC from the sponsor. A separate authorized wallet executed the instruction, and the official Arc USDC contract transferred the full 0.01 USDC to the fixed recipient. The final instruction state is executed and not reclaimed; the contract escrow balance returned to zero.

## Arc Studio usage

Arc Studio produced the initial Solidity contract, Foundry tests, React application, deployment metadata, and review iterations. The constructor was hardened with Arc chain and official USDC guards, then the expiry window was capped at 30 days. The final suite passes 35 of 35 Foundry tests. The mainnet creation bytecode and constructor argument were independently matched against the compiled Studio artifact before the real USDC flow.

## Why it can go further

The same narrow primitive can support employee purchasing authority, contractor expenses, family payments, procurement approvals, and agent-to-human payment handoffs. Future versions can add reusable policy templates and organization dashboards without changing the simple core guarantee.
