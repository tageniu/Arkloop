import { memo, type ReactNode } from 'react'
import { FileIcon } from 'lucide-react'
import { ArtifactIframe } from '../ArtifactIframe'
import { MarkdownRenderer } from '../MarkdownRenderer'
import type { PreviewResource } from './types'
import { isJsonMime } from './mime'
import { getPreviewRendererKind, type PreviewRendererKind } from './rendererKind'

function formatSize(size: number | undefined): string {
  if (size === undefined) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function textForDisplay(resource: PreviewResource): string {
  if (!resource.text) return ''
  if (!isJsonMime(resource.mimeType, resource.filename)) return resource.text
  try {
    return JSON.stringify(JSON.parse(resource.text), null, 2)
  } catch {
    return resource.text
  }
}

function Frame({ children, kind }: { children: ReactNode; kind: PreviewRendererKind }) {
  return (
    <div
      data-preview-renderer={kind}
      style={{
        width: '100%',
        border: '0.5px solid var(--c-border-subtle)',
        borderRadius: 8,
        background: 'var(--c-bg-sub)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

function TextPreview({ resource, kind }: { resource: PreviewResource; kind: 'json' | 'code' | 'text' }) {
  return (
    <Frame kind={kind}>
      <pre
        style={{
          margin: 0,
          padding: 12,
          maxHeight: 420,
          overflow: 'auto',
          color: 'var(--c-text-primary)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <code>{textForDisplay(resource)}</code>
      </pre>
    </Frame>
  )
}

function BinaryPreview({ resource }: { resource: PreviewResource }) {
  return (
    <Frame kind="binary">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, color: 'var(--c-text-secondary)' }}>
        <FileIcon size={16} style={{ color: 'var(--c-text-icon)', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--c-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resource.filename}
          </div>
          <div style={{ fontSize: 12 }}>
            {[resource.mimeType, formatSize(resource.size)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </Frame>
  )
}

type Props = {
  resource: PreviewResource
  accessToken?: string
}

function PreviewResourceContent({ resource, accessToken }: { resource: PreviewResource; accessToken: string }) {
  const kind = getPreviewRendererKind(resource)

  if (kind === 'markdown') {
    return (
      <div data-preview-renderer="markdown">
        <MarkdownRenderer content={resource.text ?? ''} artifacts={[]} accessToken={accessToken} compact />
      </div>
    )
  }

  if (kind === 'iframe') {
    if (resource.text !== undefined) {
      return (
        <div data-preview-renderer="iframe">
          <ArtifactIframe mode="static" content={resource.text} contentType={resource.mimeType} frameTitle={resource.filename} />
        </div>
      )
    }
    if (resource.blobUrl) {
      return (
        <iframe
          data-preview-renderer="iframe"
          src={resource.blobUrl}
          title={resource.filename}
          sandbox=""
          style={{ width: '100%', minHeight: 320, border: '0.5px solid var(--c-border-subtle)', borderRadius: 8 }}
        />
      )
    }
  }

  if (kind === 'image' && resource.blobUrl) {
    return (
      <div data-preview-renderer="image" style={{ display: 'inline-block', maxWidth: '100%' }}>
        <img
          src={resource.blobUrl}
          alt={resource.filename}
          draggable={false}
          style={{ display: 'block', maxWidth: '100%', borderRadius: 8, border: '0.5px solid var(--c-border-subtle)' }}
        />
      </div>
    )
  }

  if (kind === 'json' || kind === 'code' || kind === 'text') {
    return <TextPreview resource={resource} kind={kind} />
  }

  return <BinaryPreview resource={resource} />
}

export const PreviewResourceView = memo(function PreviewResourceView({ resource, accessToken = '' }: Props) {
  return <PreviewResourceContent resource={resource} accessToken={accessToken} />
})
