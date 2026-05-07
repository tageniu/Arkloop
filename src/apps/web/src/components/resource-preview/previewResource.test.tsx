import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewResourceView } from './PreviewResourceView'
import { getPreviewRendererKind } from './rendererKind'
import { buildWorkspaceResourceUrl, loadPreviewResource } from './loader'
import type { PreviewResource, ResourceRef } from './types'

vi.mock('@arkloop/shared/desktop', () => ({
  getDesktopApi: () => (globalThis as typeof globalThis & { __desktopApi?: unknown }).__desktopApi ?? null,
}))

vi.mock('@arkloop/shared/api', () => ({
  apiBaseUrl: () => 'http://api.test',
}))

function preview(source: PreviewResource['source'], mimeType: string, filename: string): PreviewResource {
  return {
    source,
    ref: source === 'artifact'
      ? { kind: source, source, key: `${source}-key`, filename }
      : source === 'local-file'
        ? { kind: source, source, rootPath: '/root', path: filename }
        : { kind: source, source, path: filename, runId: 'run-1' },
    mimeType,
    filename,
    text: 'hello',
  }
}

describe('resource preview renderer registry', () => {
  it('同 mime 不同 source 走同一 renderer', () => {
    const resources = [
      preview('artifact', 'text/markdown', 'note.md'),
      preview('local-file', 'text/markdown', 'note.md'),
      preview('workspace-file', 'text/markdown', 'note.md'),
    ]

    expect(resources.map(getPreviewRendererKind)).toEqual(['markdown', 'markdown', 'markdown'])
  })

  it('按 mime 分派 renderer，不读取来源字段', () => {
    expect(getPreviewRendererKind(preview('artifact', 'application/json', 'data.json'))).toBe('json')
    expect(getPreviewRendererKind(preview('workspace-file', 'image/png', 'chart.png'))).toBe('image')
    expect(getPreviewRendererKind(preview('local-file', 'text/html', 'index.html'))).toBe('iframe')
    expect(getPreviewRendererKind(preview('artifact', 'application/octet-stream', 'model.bin'))).toBe('binary')
  })

  it('组件暴露可测的 renderer 标记', () => {
    const html = renderToStaticMarkup(
      <PreviewResourceView resource={preview('workspace-file', 'application/json', 'data.json')} />,
    )

    expect(html).toContain('data-preview-renderer="json"')
    expect(html).toContain('hello')
  })
})

describe('resource preview loader', () => {
  const originalFetch = globalThis.fetch
  const originalCreateObjectURL = URL.createObjectURL
  const originalDesktopApi = (globalThis as typeof globalThis & { __desktopApi?: unknown }).__desktopApi

  afterEach(() => {
    globalThis.fetch = originalFetch
    URL.createObjectURL = originalCreateObjectURL
    const host = globalThis as typeof globalThis & { __desktopApi?: unknown }
    if (originalDesktopApi === undefined) {
      delete host.__desktopApi
    } else {
      host.__desktopApi = originalDesktopApi
    }
  })

  it('local-file 通过 desktop fs 读取并归一化为文本资源', async () => {
    const host = globalThis as typeof globalThis & { __desktopApi?: unknown }
    host.__desktopApi = {
      fs: {
        readFile: vi.fn().mockResolvedValue({
          data: btoa('hello local'),
          mime_type: 'text/plain',
        }),
      },
    }

    const resource = await loadPreviewResource({
      source: 'local-file',
      kind: 'local-file',
      rootPath: '/root',
      path: 'notes/a.txt',
    })

    expect(resource).toMatchObject({
      source: 'local-file',
      filename: 'a.txt',
      mimeType: 'text/plain',
      text: 'hello local',
    })
  })

  it('artifact 使用 /v1/artifacts/:key 并输出 blobUrl', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:artifact')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['png'], { type: 'image/png' }), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '3' },
      }),
    )
    globalThis.fetch = fetchMock as typeof fetch

    const resource = await loadPreviewResource({
      source: 'artifact',
      kind: 'artifact',
      key: 'artifact-key',
      filename: 'image.png',
      mimeType: 'image/png',
    }, { accessToken: 'token' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/v1/artifacts/artifact-key')
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer token' })
    expect(resource).toMatchObject({
      source: 'artifact',
      filename: 'image.png',
      mimeType: 'image/png',
      size: 3,
      blobUrl: 'blob:artifact',
    })
  })

  it('workspace-file 复用 run/project endpoint 构造', () => {
    const runRef: ResourceRef = { kind: 'workspace-file', source: 'workspace-file', runId: 'run-1', path: 'notes/a.txt' }
    const projectRef: ResourceRef = { kind: 'workspace-file', source: 'workspace-file', projectId: 'project-1', path: '/notes/a.txt' }

    expect(buildWorkspaceResourceUrl(runRef)).toBe('http://api.test/v1/workspace-files?run_id=run-1&path=%2Fnotes%2Fa.txt')
    expect(buildWorkspaceResourceUrl(projectRef)).toBe('http://api.test/v1/projects/project-1/workspace/file?path=%2Fnotes%2Fa.txt')
  })
})
