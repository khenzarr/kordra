import artifact from '../contracts/out/PaymentAuthority.sol/PaymentAuthority.json'

export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_MAINNET_CHAIN_ID = 5042
export const IS_MAINNET = import.meta.env.VITE_ARC_NETWORK !== 'testnet'
export const ARC_CHAIN_ID = IS_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID
export const ARC_NETWORK_NAME = IS_MAINNET ? 'Arc Mainnet' : 'Arc Testnet'

const mainnetAddress = '0x526f678937c5acf2d9f6876d00289aee5f3a873f'
const testnetAddress = '0x8287c8eef5c01fdfdac721b40137b9ab10cf57e3'
const configuredAddress = import.meta.env.VITE_PAYMENT_AUTHORITY_ADDRESS?.trim()

export const PAYMENT_AUTHORITY_ADDRESS =
  (configuredAddress || (IS_MAINNET ? mainnetAddress : testnetAddress)) as `0x${string}`

export const PAYMENT_AUTHORITY_ABI = artifact.abi
export const PAYMENT_AUTHORITY_BYTECODE = artifact.bytecode.object as `0x${string}`
