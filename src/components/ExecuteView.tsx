import { useEffect, useState } from 'react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useSwitchChain,
} from 'wagmi'
import {
  PAYMENT_AUTHORITY_ADDRESS, PAYMENT_AUTHORITY_ABI, ARC_CHAIN_ID,
} from '../contract'
import {
  formatAddress, formatUsdc, getTxUrl, getAddressUrl,
  statusLabel, statusColor, parseOnchainError,
} from '../utils'
import { ExternalLink, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'

export function ExecuteView({ initialId }: { initialId?: string }) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID

  const [idInput, setIdInput]   = useState(initialId ?? '')
  const [lookedUp, setLookedUp] = useState<bigint | null>(() => validId(initialId))
  const [error, setError]       = useState('')

  const { data: inst, isLoading: instLoading, refetch } = useReadContract({
    address: PAYMENT_AUTHORITY_ADDRESS,
    abi: PAYMENT_AUTHORITY_ABI,
    functionName: 'getInstruction',
    args: lookedUp !== null ? [lookedUp] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: lookedUp !== null },
  }) as { data: { sponsor: string; spender: string; recipient: string; amount: bigint; expiry: bigint; refHash: string; executed: boolean; reclaimed: boolean } | undefined; isLoading: boolean; refetch: () => void }

  const {
    writeContract: execute,
    data: execTx,
    isPending: execPending,
    reset: resetExec,
  } = useWriteContract()
  const { isLoading: execConfirming, isSuccess: execSuccess } =
    useWaitForTransactionReceipt({ hash: execTx })

  useEffect(() => { if (execSuccess) void refetch() }, [execSuccess, refetch])

  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const isExpired  = inst ? nowSec >= inst.expiry : false
  const statusStr  = inst ? statusLabel(inst.executed, inst.reclaimed, inst.expiry) : ''
  const isSpender  = inst && address
    ? inst.spender.toLowerCase() === address.toLowerCase()
    : false
  const canExecute = inst && !inst.executed && !inst.reclaimed && !isExpired && isSpender && !wrongChain

  function handleLookup() {
    setError('')
    resetExec()
    const id = validId(idInput)
    if (id === null) { setError('Enter a valid instruction ID.'); return }
    setLookedUp(id)
  }

  function handleExecute() {
    setError('')
    if (lookedUp === null || !canExecute) return
    execute(
      {
        address: PAYMENT_AUTHORITY_ADDRESS,
        abi: PAYMENT_AUTHORITY_ABI,
        functionName: 'execute',
        args: [lookedUp],
        chainId: ARC_CHAIN_ID,
      },
      {
        onError: (e) => setError(parseOnchainError(e)),
      }
    )
  }

  return (
    <div className="space-y-4">

      {/* ID lookup */}
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
              Load
            </button>
          </div>
          {error && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      </div>

      {/* Instruction card */}
      {lookedUp !== null && (
        <div className="rounded-3xl p-5 glass-card space-y-4">
          {instLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : inst && inst.amount > 0n ? (
            <>
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                  Instruction #{lookedUp.toString()}
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

              {/* Amount hero */}
              <div className="rounded-2xl p-4 glass-inner">
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>AMOUNT</div>
                <div className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUsdc(inst.amount)} <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
              </div>

              {/* Address flow */}
              <div className="flex items-center gap-2 text-xs">
                <AddressChip label="Sponsor" addr={inst.sponsor} />
                <ArrowRight className="size-3 shrink-0" style={{ color: 'var(--subtle)' }} />
                <AddressChip label="Spender" addr={inst.spender} highlight={isSpender} />
                <ArrowRight className="size-3 shrink-0" style={{ color: 'var(--subtle)' }} />
                <AddressChip label="Recipient" addr={inst.recipient} />
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-xs">
                <Row label="Deadline" value={new Date(Number(inst.expiry) * 1000).toLocaleString()} />
                {inst.refHash && inst.refHash !== '0x' + '0'.repeat(64) && (
                  <Row label="Reference" value={inst.refHash.slice(0, 18) + '…'} mono />
                )}
              </div>

              {/* Execute CTA */}
              {execSuccess ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                      Payment sent to {formatAddress(inst.recipient)}
                    </span>
                  </div>
                  {execTx && (
                    <a
                      href={getTxUrl(execTx)}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'var(--accent-hover)' }}
                    >
                      View transaction <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              ) : (
                <button
                  disabled={!isConnected || (!wrongChain && !canExecute) || execPending || execConfirming || inst.executed || inst.reclaimed}
                  onClick={wrongChain
                    ? () => switchChain({ chainId: ARC_CHAIN_ID })
                    : handleExecute}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  {!isConnected ? 'Connect wallet' :
                   wrongChain ? 'Switch to Arc' :
                   inst.executed ? 'Already paid' :
                   inst.reclaimed ? 'Funds reclaimed' :
                   isExpired ? 'Instruction expired' :
                   !isSpender ? `Only spender (${formatAddress(inst.spender)}) can execute` :
                   execPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</span> :
                   execConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Sending…</span> :
                   `Send ${formatUsdc(inst.amount)} USDC`}
                </button>
              )}
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

function AddressChip({ label, addr, highlight }: { label: string; addr: string; highlight?: boolean }) {
  return (
    <a
      href={getAddressUrl(addr)}
      target="_blank" rel="noreferrer"
      className="flex flex-col items-center rounded-xl px-2 py-1.5 min-w-0"
      style={{
        background: highlight ? 'rgba(16,97,166,0.08)' : 'var(--surface-muted)',
        border: highlight ? '1px solid rgba(16,97,166,0.3)' : '1px solid var(--border)',
        color: 'var(--ink-2)',
      }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="mono text-[11px]">{formatAddress(addr)}</span>
    </a>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ color: 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}
