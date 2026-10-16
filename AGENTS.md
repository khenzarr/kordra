# Kordra project context

Kordra is an immutable one-time delegated USDC payment authority built with Arc Studio.

## Canonical deployments

### Arc Mainnet

- Contract: `0x526f678937c5acf2d9f6876d00289aee5f3a873f`
- Deploy tx: `0x3365cbf77987ea66e8798444931dbee1b8fbd71bf8f197d86e9e5162e48a6c59`
- Deployer: `0xB2F6CfD0960A1fCC532DE1BF2Aafcc3077B4c396`
- Chain ID: `5042`
- USDC: `0x3600000000000000000000000000000000000000`
- Creation bytecode and constructor argument independently matched the local artifact.

### Arc Testnet

- Contract: `0x8287c8eef5c01fdfdac721b40137b9ab10cf57e3`
- Deploy tx: `0xb60ca84e6893944fa856363f80678366644f2863663a5d30f395fe431ff7eb76`
- Chain ID: `5042002`

The earlier testnet contract `0x76ddff0d95ba7706bca32f673012bd6c50b61d79` is superseded.

## Product rules

- Sponsor locks exact USDC at instruction creation.
- Spender, recipient, amount, expiry, and reference hash cannot be changed.
- Designated spender executes once before expiry.
- Sponsor reclaims only after expiry.
- Maximum expiry window is 30 days.
- No owner, admin, fee, proxy, upgrade, oracle, or backend.

## Build facts

- Arc Studio: `https://studio.arc.io/app/a34cf66d-02a0-4733-a22b-a28ff3d1efd6`
- Contract: `contracts/PaymentAuthority.sol`
- Tests: `contracts/test/PaymentAuthority.t.sol` (35 passing)
- Frontend: React 18, Vite, TypeScript, wagmi, viem, ConnectKit
- Default frontend network: Arc Mainnet
- Set `VITE_ARC_NETWORK=testnet` only for the recorded testnet deployment.

Never add private keys, wallet secrets, Arc Studio credentials, or deployment helper tooling to the repository.
