import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { loadPreviewResource } from './loader'
import { PreviewResourceView } from './PreviewResourceView'
import type { PreviewResource, ResourceRef } from './types'

type Props = {
  resource: ResourceRef
  accessToken: string
}

function releaseResource(resource: PreviewResource | null): void {
  if (resource?.blobUrl) URL.revokeObjectURL(resource.blobUrl)
}

function formatSize(size?: number): string {
  if (size === undefined) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function ResourcePreviewPanel({ resource, accessToken }: Props) {
  const [state, setState] = useState<{
    resource: ResourceRef | null
    loaded: PreviewResource | null
    error: string | null
  }>({ resource: null, loaded: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    let created: PreviewResource | null = null

    loadPreviewResource(resource, { accessToken, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) {
          releaseResource(next)
          return
        }
        created = next
        setState({ resource, loaded: next, error: null })
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setState({ resource, loaded: null, error: err instanceof Error ? err.message : 'unknown' })
        }
      })

    return () => {
      controller.abort()
      releaseResource(created)
    }
  }, [resource, accessToken])

  const current = state.resource === resource ? state : { resource, loaded: null, error: null }

  if (current.error) {
    return <div style={{ padding: 18, color: 'var(--c-text-muted)', fontSize: 13 }}>{current.error}</div>
  }

  if (!current.loaded) {
    return <div style={{ padding: 18, color: 'var(--c-text-muted)', fontSize: 13 }}>Loading</div>
  }

  const loaded = current.loaded

  return (
    <div style={{ height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--c-bg-page)' }}>
      <div style={{ height: 42, flexShrink: 0, borderBottom: '0.5px solid var(--c-border-subtle)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', minWidth: 0 }}>
        <FileText size={15} color="var(--c-text-tertiary)" />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--c-text-primary)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loaded.filename}</span>
          <span style={{ color: 'var(--c-text-muted)', fontSize: 11 }}>{[loaded.mimeType, formatSize(loaded.size)].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        <PreviewResourceView resource={loaded} accessToken={accessToken} />
      </div>
    </div>
  )
}
