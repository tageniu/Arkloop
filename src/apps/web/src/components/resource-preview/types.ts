export type ResourceSource = 'local-file' | 'artifact' | 'workspace-file'

export type LocalFileResourceRef = {
  kind: 'local-file'
  source?: 'local-file'
  rootPath: string
  path: string
  name?: string
  filename?: string
  mimeType?: string
  size?: number
}

export type ArtifactResourceRef = {
  kind: 'artifact'
  source?: 'artifact'
  key: string
  filename?: string
  mimeType?: string
  size?: number
  title?: string
}

export type WorkspaceFileResourceRef = {
  kind: 'workspace-file'
  source?: 'workspace-file'
  path: string
  name?: string
  filename?: string
  mimeType?: string
  size?: number
  runId?: string
  projectId?: string
}

export type ResourceRef = LocalFileResourceRef | ArtifactResourceRef | WorkspaceFileResourceRef

export type PreviewResource = {
  source: ResourceSource
  ref: ResourceRef
  mimeType: string
  filename: string
  size?: number
  text?: string
  blobUrl?: string
}

export type LoadPreviewResourceOptions = {
  accessToken?: string
  signal?: AbortSignal
}
