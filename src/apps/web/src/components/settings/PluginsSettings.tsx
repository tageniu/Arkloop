import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@arkloop/shared'
import {
  Download,
  Loader2,
  Power,
  RefreshCw,
} from 'lucide-react'
import {
  getPluginEnablement,
  getPluginRuntimeStatus,
  installPluginRuntime,
  listPlugins,
  setPluginEnabled,
  type PluginEnablement,
  type PluginPackage,
  type PluginRuntimeState,
} from '../../api'
import { useLocale } from '../../contexts/LocaleContext'
import { SettingsPage } from './_SettingsLayout'
import { SettingsButton, SettingsIconButton } from './_SettingsButton'
import { SettingsModalFrame } from './_SettingsModalFrame'
import { SettingsSegmentedControl } from './_SettingsSegmentedControl'
import { SettingsSummaryCard, SettingsSummaryCardBadge, SettingsSummaryCardLine } from './_SettingsSummaryCard'

type PluginTab = 'installed' | 'marketplace'

type PluginStatus = {
  enablement: PluginEnablement | null
  runtime: PluginRuntimeState | null
}

type LoadState = {
  plugins: PluginPackage[]
  statusByID: Record<string, PluginStatus>
}

type Props = {
  accessToken: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasRuntime(manifest: Record<string, unknown>): boolean {
  return isRecord(manifest.runtime) && Object.keys(manifest.runtime).length > 0
}

function contributionKeys(manifest: Record<string, unknown>) {
  return [
    hasRuntime(manifest) ? 'runtime' : '',
    hasArray(manifest.mcp_servers) ? 'mcp' : '',
    hasArray(manifest.skills) ? 'skill' : '',
    hasArray(manifest.hooks) ? 'hook' : '',
    typeof manifest.context === 'string' && manifest.context.trim() ? 'context' : '',
  ].filter(Boolean)
}

function sourceLabel(sourceKind: string, builtIn: string, custom: string) {
  return sourceKind === 'builtin' ? builtIn : custom
}

function contributionNames(manifest: Record<string, unknown>, key: string, fallback: string) {
  const raw = manifest[key]
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    if (!isRecord(item)) return `${fallback} ${index + 1}`
    const name = item.name ?? item.install_key ?? item.skill_key ?? item.id
    return typeof name === 'string' && name.trim() ? name.trim() : `${fallback} ${index + 1}`
  })
}

export function PluginsSettings({ accessToken }: Props) {
  const { t } = useLocale()
  const { addToast } = useToast()
  const ds = t.desktopSettings
  const ps = ds.pluginsPage
  const [tab, setTab] = useState<PluginTab>('installed')
  const [state, setState] = useState<LoadState>({ plugins: [], statusByID: {} })
  const [loading, setLoading] = useState(true)
  const [busyID, setBusyID] = useState<string | null>(null)
  const [selectedPluginID, setSelectedPluginID] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const plugins = await listPlugins(accessToken)
      const statusPairs = await Promise.all(
        plugins.map(async (plugin) => {
          const [enablement, runtime] = await Promise.all([
            getPluginEnablement(accessToken, plugin.id),
            getPluginRuntimeStatus(accessToken, plugin.id),
          ])
          return [plugin.id, { enablement, runtime }] as const
        }),
      )
      setState({ plugins, statusByID: Object.fromEntries(statusPairs) })
    } catch (error) {
      addToast(error instanceof Error ? error.message : ps.loadFailed, 'error')
    } finally {
      setLoading(false)
    }
  }, [accessToken, addToast, ps.loadFailed])

  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo(() => state.plugins.filter((plugin) => plugin.is_active), [state.plugins])
  const selectedPlugin = useMemo(
    () => items.find((plugin) => plugin.id === selectedPluginID) ?? null,
    [items, selectedPluginID],
  )

  const installRuntime = useCallback(async (plugin: PluginPackage) => {
    setBusyID(plugin.id)
    try {
      const runtime = await installPluginRuntime(accessToken, plugin.id)
      setState((current) => ({
        ...current,
        statusByID: {
          ...current.statusByID,
          [plugin.id]: { ...(current.statusByID[plugin.id] ?? { enablement: null }), runtime },
        },
      }))
    } catch (error) {
      addToast(error instanceof Error ? error.message : ps.runtimeInstallFailed, 'error')
    } finally {
      setBusyID(null)
    }
  }, [accessToken, addToast, ps.runtimeInstallFailed])

  const toggleEnabled = useCallback(async (plugin: PluginPackage, enabled: boolean) => {
    setBusyID(plugin.id)
    try {
      const enablement = await setPluginEnabled(accessToken, plugin.id, enabled)
      setState((current) => ({
        ...current,
        statusByID: {
          ...current.statusByID,
          [plugin.id]: { ...(current.statusByID[plugin.id] ?? { runtime: null }), enablement },
        },
      }))
    } catch (error) {
      addToast(error instanceof Error ? error.message : enabled ? ps.enableFailed : ps.disableFailed, 'error')
    } finally {
      setBusyID(null)
    }
  }, [accessToken, addToast, ps.disableFailed, ps.enableFailed])

  const contributionLabel = useCallback((key: string) => {
    const labels: Record<string, string> = {
      runtime: ps.runtime,
      mcp: ps.mcp,
      skill: ps.skill,
      hook: ps.hook,
      context: ps.context,
    }
    return labels[key] ?? key
  }, [ps.context, ps.hook, ps.mcp, ps.runtime, ps.skill])

  const renderPluginCard = (plugin: PluginPackage) => {
    const status = state.statusByID[plugin.id]
    const enabled = status?.enablement?.enabled ?? false
    const runtimeStatus = status?.runtime?.status ?? 'not_installed'
    const runtimeReady = runtimeStatus === 'installed'
    const runtimeNeeded = hasRuntime(plugin.manifest)
    const keys = contributionKeys(plugin.manifest)
    const busy = busyID === plugin.id
    const capabilities = keys.map(contributionLabel).join(' / ') || '-'

    return (
      <SettingsSummaryCard
        key={plugin.package_id}
        minHeightClass="min-h-[154px]"
        onClick={() => setSelectedPluginID(plugin.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold leading-tight text-[var(--c-text-primary)]">
              {plugin.display_name}
            </h3>
            {plugin.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--c-text-muted)]">
                {plugin.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <SettingsSummaryCardBadge>{sourceLabel(plugin.source_kind, ps.builtIn, ps.custom)}</SettingsSummaryCardBadge>
            <SettingsSummaryCardBadge>{enabled ? ps.enabled : ps.disabled}</SettingsSummaryCardBadge>
            {runtimeNeeded && (
              <SettingsSummaryCardBadge>{runtimeReady ? ps.ready : ps.needsSetup}</SettingsSummaryCardBadge>
            )}
          </div>
        </div>

        <div className="mt-4 min-w-0 space-y-2 pr-[148px]">
          <SettingsSummaryCardLine label={ps.version} value={plugin.version} />
          <SettingsSummaryCardLine label={ps.capabilities} value={capabilities} />
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          {runtimeNeeded && !runtimeReady && (
            <SettingsButton
              variant="secondary"
              icon={busy ? <Loader2 className="animate-spin" /> : <Download />}
              disabled={busy}
              onClick={() => void installRuntime(plugin)}
            >
              {ps.installRuntime}
            </SettingsButton>
          )}
          <SettingsButton
            variant={enabled ? 'secondary' : 'primary'}
            icon={busy ? <Loader2 className="animate-spin" /> : <Power />}
            disabled={busy || (runtimeNeeded && !runtimeReady && !enabled)}
            onClick={() => void toggleEnabled(plugin, !enabled)}
          >
            {enabled ? ps.disable : ps.enable}
          </SettingsButton>
        </div>
      </SettingsSummaryCard>
    )
  }

  return (
    <SettingsPage title={ds.pluginsTitle} className="max-w-[760px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SettingsSegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'installed', label: ps.installedTab },
            { value: 'marketplace', label: ps.marketplaceTab },
          ]}
        />
        <SettingsIconButton label={ps.refresh} onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </SettingsIconButton>
      </div>

      {tab === 'installed' ? (
        loading ? (
          <div className="grid min-h-[220px] place-items-center rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-bg-menu)] text-[var(--c-text-muted)]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-bg-menu)] px-5 py-6 text-sm text-[var(--c-text-tertiary)]">
            {ps.emptyInstalled}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">{items.map(renderPluginCard)}</div>
        )
      ) : (
        <div className="rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-bg-menu)] px-5 py-6">
          <div className="text-sm font-medium text-[var(--c-text-primary)]">{ps.emptyMarketplaceTitle}</div>
          <div className="mt-1 text-[12.5px] leading-5 text-[var(--c-text-tertiary)]">{ps.emptyMarketplace}</div>
        </div>
      )}

      {selectedPlugin && (
        <PluginDetailModal
          plugin={selectedPlugin}
          status={state.statusByID[selectedPlugin.id] ?? { enablement: null, runtime: null }}
          busy={busyID === selectedPlugin.id}
          labels={ps}
          contributionLabel={contributionLabel}
          onClose={() => setSelectedPluginID(null)}
          onInstallRuntime={() => void installRuntime(selectedPlugin)}
          onToggleEnabled={(enabled) => void toggleEnabled(selectedPlugin, enabled)}
        />
      )}
    </SettingsPage>
  )
}

function PluginDetailModal({
  plugin,
  status,
  busy,
  labels,
  contributionLabel,
  onClose,
  onInstallRuntime,
  onToggleEnabled,
}: {
  plugin: PluginPackage
  status: PluginStatus
  busy: boolean
  labels: ReturnType<typeof useLocale>['t']['desktopSettings']['pluginsPage']
  contributionLabel: (key: string) => string
  onClose: () => void
  onInstallRuntime: () => void
  onToggleEnabled: (enabled: boolean) => void
}) {
  const enabled = status.enablement?.enabled ?? false
  const runtimeStatus = status.runtime?.status ?? 'not_installed'
  const runtimeNeeded = hasRuntime(plugin.manifest)
  const runtimeReady = runtimeStatus === 'installed'
  const keys = contributionKeys(plugin.manifest)
  const capabilityLabels = keys.map(contributionLabel)
  const mcpServers = contributionNames(plugin.manifest, 'mcp_servers', labels.mcp)
  const skills = contributionNames(plugin.manifest, 'skills', labels.skill)
  const hooks = contributionNames(plugin.manifest, 'hooks', labels.hook)

  return (
    <SettingsModalFrame
      open
      title={plugin.display_name}
      onClose={onClose}
      width={620}
      footer={
        <>
          {runtimeNeeded && !runtimeReady && (
            <SettingsButton
              variant="secondary"
              icon={busy ? <Loader2 className="animate-spin" /> : <Download />}
              disabled={busy}
              onClick={onInstallRuntime}
            >
              {labels.installRuntime}
            </SettingsButton>
          )}
          <SettingsButton
            variant={enabled ? 'secondary' : 'primary'}
            icon={busy ? <Loader2 className="animate-spin" /> : <Power />}
            disabled={busy || (runtimeNeeded && !runtimeReady && !enabled)}
            onClick={() => onToggleEnabled(!enabled)}
          >
            {enabled ? labels.disable : labels.enable}
          </SettingsButton>
        </>
      }
    >
      <div className="mt-6 flex flex-col gap-5">
        {plugin.description && (
          <p className="text-[13px] leading-5 text-[var(--c-text-secondary)]">{plugin.description}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSummaryCardLine label={labels.pluginId} value={plugin.id} />
          <SettingsSummaryCardLine label={labels.version} value={plugin.version} />
          <SettingsSummaryCardLine label={labels.source} value={plugin.source_kind} />
          <SettingsSummaryCardLine label={labels.runtimeStatus} value={runtimeNeeded ? runtimeStatus : labels.notRequired} />
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium leading-tight text-[var(--c-text-muted)]">{labels.capabilities}</div>
          <div className="flex flex-wrap gap-1.5">
            <SettingsSummaryCardBadge>{enabled ? labels.enabled : labels.disabled}</SettingsSummaryCardBadge>
            {runtimeNeeded && <SettingsSummaryCardBadge>{runtimeReady ? labels.ready : labels.needsSetup}</SettingsSummaryCardBadge>}
            {capabilityLabels.map((label) => <SettingsSummaryCardBadge key={label}>{label}</SettingsSummaryCardBadge>)}
          </div>
        </div>

        <PluginContributionList label={labels.mcp} items={mcpServers} />
        <PluginContributionList label={labels.skill} items={skills} />
        <PluginContributionList label={labels.hook} items={hooks} />
        {typeof plugin.manifest.context === 'string' && plugin.manifest.context.trim() && (
          <PluginContributionList label={labels.context} items={[plugin.manifest.context]} />
        )}
      </div>
    </SettingsModalFrame>
  )
}

function PluginContributionList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium leading-tight text-[var(--c-text-muted)]">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => <SettingsSummaryCardBadge key={item}>{item}</SettingsSummaryCardBadge>)}
      </div>
    </div>
  )
}
