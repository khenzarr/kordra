# Kordra

**One payment. Exact authority.**

Kordra gives a sponsor a narrow, verifiable way to delegate one USDC payment. The sponsor locks the exact amount and fixes the authorized spender, recipient, and deadline. Only that spender can release the payment before expiry; if it is unused, only the sponsor can reclaim it after expiry.

No admin, fees, proxy, upgrade path, oracle, backend, or partial payment logic.

Built by [KHENZAR](https://github.com/khenzarr) with [Arc Studio](https://studio.arc.io/app/a34cf66d-02a0-4733-a22b-a28ff3d1efd6).

**Live app:** [kordra.vercel.app](https://kordra.vercel.app)

## Why it exists

- A company can let an employee pay one named supplier without sharing unrestricted treasury access.
- An individual can reserve money while authorizing another person to pay a fixed service provider.
- Both parties can verify the amount, recipient, authority, deadline, and final outcome on Arc.

## Live contracts

| Network | Contract | Deployment |
|---|---|---|
| **Arc Mainnet (5042)** | [`0x526f...a873f`](https://explorer.arc.io/address/0x526f678937c5acf2d9f6876d00289aee5f3a873f) | [`0x3365...a6c59`](https://explorer.arc.io/tx/0x3365cbf77987ea66e8798444931dbee1b8fbd71bf8f197d86e9e5162e48a6c59) |
| Arc Testnet (5042002) | [`0x8287...57e3`](https://explorer.testnet.arc.io/address/0x8287c8eef5c01fdfdac721b40137b9ab10cf57e3) | [`0xb60c...eb76`](https://explorer.testnet.arc.io/tx/0xb60ca84e6893944fa856363f80678366644f2863663a5d30f395fe431ff7eb76) |

Official Arc USDC: `0x3600000000000000000000000000000000000000` (6 decimals).

### Mainnet verification record

The mainnet deployment was independently checked against the compiled artifact in this repository:

- transaction status: success
- deployer: `0xB2F6CfD0960A1fCC532DE1BF2Aafcc3077B4c396`
- deployed address: `0x526f678937c5acf2d9f6876d00289aee5f3a873f`
- creation bytecode plus constructor argument: exact artifact match
- immutable `usdcToken()`: `0x3600000000000000000000000000000000000000`
- deployed runtime bytecode: present (2,516 bytes)

### Verified mainnet demo

Instruction #1 completed the full three-wallet flow with real USDC:

| Role | Address |
|---|---|
| Sponsor | `0xB2F6CfD0960A1fCC532DE1BF2Aafcc3077B4c396` |
| Authorized spender | `0x1e19c1c829A387c2246567c0df264D81310d7775` |
| Fixed recipient | `0x0b943Fe9f1f8135e0751BA8B43dc0cD688ad209D` |

- Amount: **0.01 USDC**
- Create and lock: [`0xbf52...ac65`](https://explorer.arc.io/tx/0xbf5216e063734dd1aed33acd00cc2b8cfb60e7dd3d39920e99c1c890409eac65)
- Authorized execution: [`0x7883...61ea`](https://explorer.arc.io/tx/0x788314a71d133ddf9655287d85f719a5a09b2eebb1fc7cda566b04a1a26061ea)
- Final state: `executed = true`, `reclaimed = false`, contract escrow balance `0 USDC`

## Contract rules

- The sponsor approves and deposits the full amount when creating an instruction.
- Spender, recipient, amount, expiry, and reference hash are immutable.
- Only the designated spender can execute, exactly once, before expiry.
- Only the original sponsor can reclaim, and only after expiry.
- Expiry must be within 30 days of creation.
- Constructor guards restrict deployment to Arc Testnet or Arc Mainnet and official Arc USDC.
- `SafeERC20`, checks-effects-interactions, and `ReentrancyGuard` protect token movement.

## Test and review evidence

| Check | Result |
|---|---|
| Foundry unit tests | **35 / 35 passed** |
| Arc Studio contract review, round 1 | one token/chain guard finding, fixed |
| Arc Studio contract review, final round | no Critical or High findings |
| Slither | three expected Low timestamp findings for deadline comparisons |
| Mainnet creation bytecode | exact local artifact match |

This is a hackathon experiment and has not received a paid third-party audit. Use small amounts.

## Repository layout

```text
contracts/
  PaymentAuthority.sol
  test/PaymentAuthority.t.sol
  out/PaymentAuthority.sol/PaymentAuthority.json
src/
  components/CreateView.tsx
  components/ExecuteView.tsx
  components/InspectView.tsx
  contract.ts
  App.tsx
```

## Run locally

```bash
npm install --legacy-peer-deps
npm run dev
```

The default build targets Arc Mainnet. To run against the recorded testnet deployment:

```bash
VITE_ARC_NETWORK=testnet npm run dev
```

Build and test:

```bash
npm run build
forge test --match-path "contracts/test/PaymentAuthority.t.sol" -v
```

## User flow

1. **Sponsor:** connect on Arc Mainnet, enter the spender, recipient, amount, deadline, and optional reference.
2. **Sponsor:** approve the exact USDC amount, then create the instruction.
3. **Spender:** open `?tab=execute&id=<ID>` and execute before expiry.
4. **Anyone:** inspect the instruction and explorer evidence with `?tab=inspect&id=<ID>`.
5. **Sponsor:** if execution never happens, reclaim after expiry.

## Arc Studio provenance

Contracts, tests, and the first working app were produced and reviewed in Arc Studio. The public Studio workspace is the build provenance required by the Arc Microgrants program:

[`studio.arc.io/app/a34cf66d-02a0-4733-a22b-a28ff3d1efd6`](https://studio.arc.io/app/a34cf66d-02a0-4733-a22b-a28ff3d1efd6)

## License

MIT
