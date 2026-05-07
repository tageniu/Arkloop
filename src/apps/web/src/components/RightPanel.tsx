import type { ReactNode } from 'react'
import { FileText, FolderOpen, X } from 'lucide-react'
import { iconButtonSmCls } from './buttonStyles'
import './RightPanel.css'

export type RightPanelTab = {
  id: string
  title: string
  kind: 'files' | 'source' | 'code' | 'document' | 'agent' | 'resource'
  content: ReactNode
  closable?: boolean
}

type Props = {
  tabs: RightPanelTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab?: (id: string) => void
}

function TabIcon({ kind }: { kind: RightPanelTab['kind'] }) {
  if (kind === 'files') return <FolderOpen size={14} />
  return <FileText size={14} />
}

export function RightPanel({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null

  return (
    <div style={{ height: '100%', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--c-bg-page)' }}>
      <div
        style={{
          height: 42,
          flexShrink: 0,
          borderBottom: '0.5px solid var(--c-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '0 10px',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab?.id
          const closable = tab.closable !== false && !!onCloseTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={[
                'right-panel-tab group/right-panel-tab hover:bg-[var(--c-bg-deep)] hover:text-[var(--c-text-primary)]',
                closable ? 'right-panel-tab--closable' : '',
              ].filter(Boolean).join(' ')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                minWidth: 0,
                maxWidth: 220,
                height: 28,
                padding: '0 8px',
                borderRadius: 6.5,
                border: 0,
                background: active ? 'var(--c-bg-deep)' : undefined,
                color: active ? 'var(--c-text-primary)' : 'var(--c-text-secondary)',
                fontSize: 13,
                font: 'inherit',
                cursor: 'pointer',
                transition: 'background-color 160ms ease, color 160ms ease',
              }}
            >
              <TabIcon kind={tab.kind} />
              <span className="right-panel-tab__title">{tab.title}</span>
              {closable ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  className={`${iconButtonSmCls} right-panel-tab__close pointer-events-none absolute right-1 opacity-0 group-hover/right-panel-tab:pointer-events-auto group-hover/right-panel-tab:opacity-100`}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    background: 'var(--c-bg-deep)',
                    color: 'inherit',
                  }}
                >
                  <X size={12} />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {activeTab?.content ?? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--c-text-muted)', fontSize: 13 }}>
            这里还没有内容
          </div>
        )}
      </div>
    </div>
  )
}
