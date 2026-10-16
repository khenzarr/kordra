import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { NetworkArc } from '@web3icons/react'
import { CreateView } from './components/CreateView'
import { ExecuteView } from './components/ExecuteView'
import { InspectView } from './components/InspectView'
import { PAYMENT_AUTHORITY_ADDRESS, ARC_CHAIN_ID, ARC_NETWORK_NAME } from './contract'
import { getAddressUrl } from './utils'
import { ExternalLink } from 'lucide-react'

type Tab = 'create' | 'execute' | 'inspect'

function parseInitialState(): { tab: Tab; id?: string } {
  if (typeof window === 'undefined') return { tab: 'create' }
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab') as Tab | null
  const id  = params.get('id') ?? undefined
  if (tab === 'execute' || tab === 'inspect') return { tab, id }
  if (id) return { tab: 'execute', id }
  return { tab: 'create' }
}

export default function App() {
  const { chainId, isConnected } = useAccount()
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID

  const initial = parseInitialState()
  const [tab, setTab] = useState<Tab>(initial.tab)

  // Keep URL in sync with tab + id
  function selectTab(t: Tab) {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    url.searchParams.delete('id')
    window.history.replaceState({}, '', url.toString())
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'create',  label: 'Create' },
    { key: 'execute', label: 'Execute' },
    { key: 'inspect', label: 'Inspect' },
  ]

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <div className="mx-auto max-w-md px-4 py-6 pb-24 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              Kordra
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              One payment. Exact authority.
            </p>
          </div>
          <ConnectKitButton />
        </div>

        {/* Network badge */}
        <div
          className="flex items-center justify-between rounded-2xl px-3 py-2.5 glass-card"
        >
          <div className="flex items-center gap-2">
            <NetworkArc variant="branded" size={18} />
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{ARC_NETWORK_NAME}</span>
          </div>
          <div className="flex items-center gap-2">
            {wrongChain && (
              <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>Wrong network</span>
            )}
            <a
              href={getAddressUrl(PAYMENT_AUTHORITY_ADDRESS)}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium mono"
              style={{ color: 'var(--accent-hover)' }}
            >
              {PAYMENT_AUTHORITY_ADDRESS.slice(0, 8)}…{PAYMENT_AUTHORITY_ADDRESS.slice(-4)}
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-1 rounded-2xl p-1"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => selectTab(t.key)}
              className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
              style={
                tab === t.key
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { color: 'var(--muted)' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Views */}
        {tab === 'create'  && <CreateView />}
        {tab === 'execute' && <ExecuteView initialId={initial.id} />}
        {tab === 'inspect' && <InspectView initialId={initial.id} />}

      </div>
    </div>
  )
}
