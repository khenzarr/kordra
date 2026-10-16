import { useEffect, useState } from 'react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useSwitchChain,
} from 'wagmi'
import {
  PAYMENT_AUTHORITY_ADDRESS, PAYMENT_AUTHORITY_ABI, ARC_CHAIN_ID, ARC_NETWORK_NAME,
} from '../contract'
import {
  formatAddress, formatUsdc, getTxUrl, getAddressUrl,
  statusLabel, statusColor, parseOnchainError,
} from '../utils'
import { ExternalLink, Loader2, CheckCircle2 } from 'lucide-react'

export function InspectView({ initialId }: { initialId?: string }) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID

  const [idInput, setIdInput]   = useState(initialId ?? '')
  const [lookedUp, setLookedUp] = useState<bigint | null>(() => validId(initialId))
  const [lookupError, setLookupError] = useState('')
  const [actionError, setActionError] = useState('')

  const { data: inst, isLoading, refetch } = useReadContract({
    address: PAYMENT_AUTHORITY_ADDRESS,
    abi: PAYMENT_AUTHORITY_ABI,
    functionName: 'getInstruction',
    args: lookedUp !== null ? [lookedUp] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: lookedUp !== null },
  }) as { data: { sponsor: string; spender: string; recipient: string; amount: bigint; expiry: bigint; refHash: string; executed: boolean; reclaimed: boolean } | undefined; isLoading: boolean; refetch: () => void }

  const {
    writeContract: reclaim,
    data: reclaimTx,
    isPending: reclaimPending,
    reset: resetReclaim,
  } = useWriteContract()
  const { isLoading: reclaimConfirming, isSuccess: reclaimSuccess } =
    useWaitForTransactionReceipt({ hash: reclaimTx })

  useEffect(() => { if (reclaimSuccess) void refetch() }, [reclaimSuccess, refetch])

  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const isExpired   = inst ? nowSec >= inst.expiry : false
  const statusStr   = inst ? statusLabel(inst.executed, inst.reclaimed, inst.expiry) : ''
  const isSponsor   = inst && address
    ? inst.sponsor.toLowerCase() === address.toLowerCase()
    : false
  const canReclaim  = inst && !inst.executed && !inst.reclaimed && isExpired && isSponsor && !wrongChain

  function handleLookup() {
    setLookupError(''); setActionError('')
    resetReclaim()
    const id = validId(idInput)
    if (id === null) { setLookupError('Enter a valid instruction ID.'); return }
    setLookedUp(id)
  }

  function handleReclaim() {
    setActionError('')
    if (lookedUp === null || !canReclaim) return
    reclaim(
      {
        address: PAYMENT_AUTHORITY_ADDRESS,
        abi: PAYMENT_AUTHORITY_ABI,
        functionName: 'reclaim',
        args: [lookedUp],
        chainId: ARC_CHAIN_ID,
      },
      { onError: (e) => setActionError(parseOnchainError(e)) }
    )
  }

  const contractUrl = getAddressUrl(PAYMENT_AUTHORITY_ADDRESS)

  return (
    <div className="space-y-4">

      {/* Lookup */}
      <div className="rounded-3xl p-5 glass-card space-y-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>INSTRUCTION ID</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl px-3 py-2.5 text-sm mono glass-inner outline-none"
              style={{ color: 'var(--ink)' }}
              placeholder="e.g. 1"
              value={idInput}
              onChange={e => setIdInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
            />
            <button
              onClick={handleLookup}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Inspect
            </button>
          </div>
          {lookupError && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{lookupError}</p>}
        </div>

        {/* Contract link */}
        <a
          href={contractUrl}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--accent-hover)' }}
        >
          View contract on ArcScan <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Result */}
      {lookedUp !== null && (
        <div className="rounded-3xl p-5 glass-card space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : inst && inst.amount > 0n ? (
            <>
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                  #{lookedUp.toString()}
                </span>
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: `${statusColor(statusStr)}18`,
                    color: statusColor(statusStr),
                  }}
                >
                  {statusStr}
                </span>
              </div>

              {/* Amount */}
              <div className="rounded-2xl p-4 glass-inner">
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>LOCKED AMOUNT</div>
                <div className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUsdc(inst.amount)}{' '}
                  <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
              </div>

              {/* All addresses */}
              <div className="space-y-2">
                <AddressRow label="Sponsor" addr={inst.sponsor} you={address} />
                <AddressRow label="Spender" addr={inst.spender} you={address} />
                <AddressRow label="Recipient" addr={inst.recipient} you={address} />
              </div>

              {/* Timeline */}
              <div className="space-y-1.5 text-xs">
                <Row label="Deadline" value={new Date(Number(inst.expiry) * 1000).toLocaleString()} />
                <Row label="Executed" value={inst.executed ? 'Yes' : 'No'} ok={inst.executed} />
                <Row label="Reclaimed" value={inst.reclaimed ? 'Yes' : 'No'} ok={inst.reclaimed} />
                {inst.refHash && inst.refHash !== '0x' + '0'.repeat(64) && (
                  <Row label="Reference hash" value={inst.refHash} mono />
                )}
              </div>

              {actionError && (
                <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{actionError}</p>
              )}

              {/* Reclaim CTA — only for sponsor after expiry */}
              {reclaimSuccess ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                      {formatUsdc(inst.amount)} USDC returned to your wallet
                    </span>
                  </div>
                  {reclaimTx && (
                    <a
                      href={getTxUrl(reclaimTx)}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'var(--accent-hover)' }}
                    >
                      View transaction <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              ) : isSponsor && isExpired && !inst.executed && !inst.reclaimed ? (
                <button
                  disabled={!isConnected || (!wrongChain && !canReclaim) || reclaimPending || reclaimConfirming}
                  onClick={wrongChain
                    ? () => switchChain({ chainId: ARC_CHAIN_ID })
                    : handleReclaim}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  {wrongChain ? `Switch to ${ARC_NETWORK_NAME}` :
                   reclaimPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</span> :
                   reclaimConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Reclaiming…</span> :
                   `Reclaim ${formatUsdc(inst.amount)} USDC`}
                </button>
              ) : isSponsor && !isExpired && !inst.executed && !inst.reclaimed ? (
                <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
                  You may reclaim after the deadline: {new Date(Number(inst.expiry) * 1000).toLocaleString()}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No instruction found for ID #{lookedUp.toString()}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function validId(value?: string): bigint | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  try { return BigInt(value) } catch { return null }
}

function AddressRow({ label, addr, you }: { label: string; addr: string; you?: string }) {
  const isYou = you && addr.toLowerCase() === you.toLowerCase()
  return (
    <div className="flex items-center justify-between text-xs rounded-xl px-3 py-2 glass-inner">
      <span className="font-semibold" style={{ color: 'var(--muted)' }}>{label}</span>
      <div className="flex items-center gap-2">
        {isYou && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: 'rgba(16,97,166,0.1)', color: 'var(--accent-hover)' }}>
            you
          </span>
        )}
        <a
          href={getAddressUrl(addr)}
          target="_blank" rel="noreferrer"
          className="mono inline-flex items-center gap-0.5 hover:underline"
          style={{ color: 'var(--ink-2)' }}
        >
          {formatAddress(addr)} <ExternalLink className="size-2.5" />
        </a>
      </div>
    </div>
  )
}

function Row({ label, value, mono, ok }: { label: string; value: string; mono?: boolean; ok?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className={mono ? 'mono text-[11px]' : ''}
        style={{ color: ok ? 'var(--success)' : 'var(--ink-2)' }}
      >
        {value}
      </span>
    </div>
  )
}
