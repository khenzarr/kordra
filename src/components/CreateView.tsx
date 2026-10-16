import { useEffect, useState } from 'react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useSwitchChain,
} from 'wagmi'
import { erc20Abi, isAddress, keccak256, stringToHex } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import {
  PAYMENT_AUTHORITY_ADDRESS, PAYMENT_AUTHORITY_ABI, ARC_CHAIN_ID,
} from '../contract'
import { formatAddress, formatUsdc, getTxUrl, parseOnchainError } from '../utils'
import { ExternalLink, Loader2, Info, CheckCircle2, AlertTriangle } from 'lucide-react'

const USDC = getUsdc(ARC_CHAIN_ID)!

export function CreateView() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID

  const [spender, setSpender]     = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount]       = useState('')
  const [expiry, setExpiry]       = useState('')
  const [refInput, setRefInput]   = useState('')
  const [error, setError]         = useState('')
  const [newId, setNewId]         = useState<bigint | null>(null)

  // USDC balance of connected wallet
  const { data: balance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  })

  // 1) Approve USDC
  const {
    writeContract: approve,
    data: approveTx,
    isPending: approvePending,
    reset: resetApprove,
  } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTx })

  // 2) Create instruction
  const {
    writeContract: create,
    data: createTx,
    isPending: createPending,
    reset: resetCreate,
  } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } =
    useWaitForTransactionReceipt({ hash: createTx })

  // Parse new instruction ID from InstructionCreated event log
  useEffect(() => {
    if (!createSuccess || !createReceipt || newId !== null) return
    try {
      // Event topic[1] is the id (first indexed param after the anonymous event)
      const log = createReceipt.logs.find(
        l => l.address.toLowerCase() === PAYMENT_AUTHORITY_ADDRESS.toLowerCase()
      )
      if (log && log.topics[1]) {
        setNewId(BigInt(log.topics[1]))
      }
    } catch {/* ignore */}
  }, [createSuccess, createReceipt, newId])

  const parsedAmount = (() => {
    try { return parseAmount(ARC_CHAIN_ID, amount) } catch { return null }
  })()

  const expiryTs = (() => {
    if (!expiry) return null
    return Math.floor(new Date(expiry).getTime() / 1000)
  })()

  const refHash = (() => {
    if (!refInput.trim()) return '0x' + '0'.repeat(64)
    return keccak256(stringToHex(refInput.trim()))
  })()

  const nowSec = Math.floor(Date.now() / 1000)
  const MAX_EXPIRY_WINDOW_SEC = 30 * 24 * 60 * 60
  const canApprove =
    isConnected && !wrongChain && isAddress(spender) && isAddress(recipient) &&
    parsedAmount && parsedAmount.raw > 0n && !!expiryTs &&
    expiryTs > nowSec && expiryTs <= nowSec + MAX_EXPIRY_WINDOW_SEC

  function handleApprove() {
    setError('')
    if (!canApprove || !parsedAmount) return
    approve(
      {
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PAYMENT_AUTHORITY_ADDRESS, parsedAmount.raw],
        chainId: ARC_CHAIN_ID,
      },
      { onError: (e) => setError(parseOnchainError(e)) }
    )
  }

  function handleCreate() {
    setError('')
    const currentTime = Math.floor(Date.now() / 1000)
    if (!parsedAmount || !expiryTs || !isAddress(spender) || !isAddress(recipient) ||
        chainId !== ARC_CHAIN_ID || expiryTs <= currentTime ||
        expiryTs > currentTime + MAX_EXPIRY_WINDOW_SEC) {
      setError('Check the addresses, network, amount and deadline before creating.')
      return
    }
    create(
      {
        address: PAYMENT_AUTHORITY_ADDRESS,
        abi: PAYMENT_AUTHORITY_ABI,
        functionName: 'createInstruction',
        args: [spender as `0x${string}`, recipient as `0x${string}`, parsedAmount.raw, BigInt(expiryTs), refHash as `0x${string}`],
        chainId: ARC_CHAIN_ID,
      },
      {
        onError: (e) => setError(parseOnchainError(e)),
      }
    )
  }

  function handleReset() {
    resetApprove(); resetCreate()
    setSpender(''); setRecipient(''); setAmount(''); setExpiry(''); setRefInput('')
    setError(''); setNewId(null)
  }

  const step = !approveSuccess ? 'approve' : !createSuccess ? 'create' : 'done'

  return (
    <div className="space-y-4">

      {/* Warning */}
      <div className="flex gap-2 rounded-2xl p-3 glass-inner">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
        <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
          USDC moves into the contract immediately and stays locked until the spender executes or the deadline passes. Verify all addresses before confirming.
        </p>
      </div>

      {createSuccess && newId !== null ? (
        /* Success state */
        <div className="rounded-3xl p-5 glass-card space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--success)' }}>
              Instruction #{newId.toString()} created
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Share the instruction ID <strong>#{newId.toString()}</strong> with the spender so they can execute the payment from the Execute tab.
          </p>
          <div className="flex gap-2">
            {createTx && (
              <a
                href={getTxUrl(createTx)}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--accent-hover)' }}
              >
                View transaction <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <button
            onClick={handleReset}
            className="w-full rounded-2xl py-3 text-sm font-semibold"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          >
            Create another
          </button>
        </div>
      ) : (
        <div className="rounded-3xl p-5 glass-card space-y-4">

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <span className={step === 'approve' ? 'font-bold' : ''} style={{ color: step === 'approve' ? 'var(--accent)' : undefined }}>
              1 Approve USDC
            </span>
            <span>→</span>
            <span className={step === 'create' ? 'font-bold' : ''} style={{ color: step === 'create' ? 'var(--accent)' : undefined }}>
              2 Create Instruction
            </span>
          </div>

          {/* Spender */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>SPENDER ADDRESS</label>
            <input
              className="w-full rounded-xl px-3 py-2.5 text-sm mono glass-inner outline-none focus:border-[var(--focus)]"
              style={{ color: 'var(--ink)' }}
              placeholder="0x…  — who can execute this payment"
              value={spender}
              onChange={e => setSpender(e.target.value)}
              disabled={approvePending || approveConfirming || approveSuccess}
            />
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>RECIPIENT ADDRESS</label>
            <input
              className="w-full rounded-xl px-3 py-2.5 text-sm mono glass-inner outline-none"
              style={{ color: 'var(--ink)' }}
              placeholder="0x…  — fixed payment destination"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              disabled={approvePending || approveConfirming || approveSuccess}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>AMOUNT (USDC)</label>
            <div className="glass-inner rounded-xl px-3 py-2.5 flex items-center gap-2">
              <input
                className="flex-1 bg-transparent text-2xl font-bold tabular-nums display outline-none"
                style={{ color: 'var(--ink)' }}
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                disabled={approvePending || approveConfirming || approveSuccess}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                }}
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
            {balance !== undefined && (
              <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--subtle)' }}>
                <span>Wallet balance</span>
                <button
                  onClick={() => setAmount(formatUsdc(balance))}
                  disabled={approvePending || approveConfirming || approveSuccess}
                  className="font-semibold"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  {formatUsdc(balance)} · Max
                </button>
              </div>
            )}
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>DEADLINE</label>
            <input
              type="datetime-local"
              className="w-full rounded-xl px-3 py-2.5 text-sm glass-inner outline-none"
              style={{ color: 'var(--ink)' }}
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              disabled={approvePending || approveConfirming || approveSuccess}
              min={toLocalInputValue(new Date((nowSec + 60) * 1000))}
              max={toLocalInputValue(new Date((nowSec + MAX_EXPIRY_WINDOW_SEC) * 1000))}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              Spender must execute before this deadline (max 30 days from now). You may reclaim after it.
            </p>
          </div>

          {/* Ref hash */}
          <div>
            <label className="block text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
              REFERENCE <Info className="size-3" />
            </label>
            <input
              className="w-full rounded-xl px-3 py-2.5 text-sm glass-inner outline-none"
              style={{ color: 'var(--ink)' }}
              placeholder="Invoice ID, PO number, memo… (optional)"
              value={refInput}
              onChange={e => setRefInput(e.target.value)}
              disabled={approvePending || approveConfirming || approveSuccess}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              Stored as a bytes32 hash on-chain. Visible to anyone.
            </p>
          </div>

          {error && (
            <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          {/* Approve / Create CTA */}
          {step === 'approve' ? (
            <button
              disabled={!isConnected || (!wrongChain && !canApprove) || approvePending || approveConfirming}
              onClick={wrongChain ? () => switchChain({ chainId: ARC_CHAIN_ID }) : handleApprove}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {!isConnected ? 'Connect wallet' :
               wrongChain ? 'Switch to Arc' :
               approvePending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</span> :
               approveConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Approving…</span> :
               `Approve ${amount || '0'} USDC`}
            </button>
          ) : (
            <button
              disabled={createPending || createConfirming}
              onClick={handleCreate}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {createPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</span> :
               createConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Creating…</span> :
               'Create Instruction'}
            </button>
          )}

          {approveSuccess && !createSuccess && (
            <p className="text-xs text-center" style={{ color: 'var(--success)' }}>
              USDC approved. Now confirm the instruction creation.
            </p>
          )}

          {/* Summary preview */}
          {canApprove && (
            <div className="space-y-1.5 rounded-2xl p-3 glass-inner text-xs">
              <Row label="Spender" value={formatAddress(spender)} mono />
              <Row label="Recipient" value={formatAddress(recipient)} mono />
              <Row label="Amount" value={`${amount} USDC`} />
              <Row label="Deadline" value={expiry ? new Date(expiry).toLocaleString() : '—'} />
            </div>
          )}
        </div>
      )}
    </div>
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

function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
