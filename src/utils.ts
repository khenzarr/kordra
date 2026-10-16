import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { ARC_CHAIN_ID } from './contract'

export const formatAddress = (addr: string) =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`

export const formatUsdc = (raw: bigint) => {
  const n = Number(raw) / 1_000_000
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

export const getTxUrl = (hash: string) =>
  buildTxExplorerUrl(ARC_CHAIN_ID, hash)

export const getAddressUrl = (addr: string) =>
  buildAddressExplorerUrl(ARC_CHAIN_ID, addr)

export const statusLabel = (executed: boolean, reclaimed: boolean, expiry: bigint): string => {
  if (executed) return 'Paid'
  if (reclaimed) return 'Reclaimed'
  if (BigInt(Math.floor(Date.now() / 1000)) >= expiry) return 'Expired'
  return 'Active'
}

export const statusColor = (label: string): string => {
  if (label === 'Paid') return 'var(--success)'
  if (label === 'Reclaimed') return 'var(--muted)'
  if (label === 'Expired') return 'var(--danger)'
  return 'var(--accent-hover)'
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient')) return 'Insufficient USDC balance or allowance.'
  if (msg.includes('zeroaddress')) return 'Address cannot be zero.'
  if (msg.includes('zeroamount')) return 'Amount must be greater than zero.'
  if (msg.includes('expiryinpast')) return 'Expiry must be in the future.'
  if (msg.includes('notspender')) return 'Only the designated spender can execute.'
  if (msg.includes('notsponsor')) return 'Only the sponsor can reclaim.'
  if (msg.includes('alreadyexecuted')) return 'Payment has already been made.'
  if (msg.includes('alreadyreclaimed')) return 'Funds have already been reclaimed.'
  if (msg.includes('notexpired')) return 'Instruction has not yet expired.'
  if (msg.includes('reverted')) return 'Transaction reverted. Check the instruction state.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error — please retry.'
  return 'Something went wrong. Please try again.'
}
