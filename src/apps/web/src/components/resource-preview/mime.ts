const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  log: 'text/plain',
  py: 'text/x-python',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  js: 'text/javascript',
  jsx: 'text/javascript',
  sh: 'text/x-shellscript',
  go: 'text/plain',
  yml: 'text/yaml',
  yaml: 'text/yaml',
  xml: 'application/xml',
  sql: 'text/plain',
}

export function filenameFromPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return 'file'
  return trimmed.split('/').filter(Boolean).at(-1) ?? 'file'
}

export function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

export function normalizeMimeType(value: string | null | undefined, filename: string): string {
  const raw = (value ?? '').split(';', 1)[0].trim().toLowerCase()
  return raw || guessMimeType(filename)
}

export function isTextMime(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true
  return mimeType === 'application/json' || mimeType === 'application/xml'
}

export function isMarkdownMime(mimeType: string, filename: string): boolean {
  return mimeType === 'text/markdown' || filename.toLowerCase().endsWith('.md')
}

export function isJsonMime(mimeType: string, filename: string): boolean {
  return mimeType === 'application/json' || filename.toLowerCase().endsWith('.json')
}

export function isIframeMime(mimeType: string): boolean {
  return mimeType === 'text/html' || mimeType === 'image/svg+xml'
}

export function isCodeMime(mimeType: string, filename: string): boolean {
  if (!isTextMime(mimeType)) return false
  if (isMarkdownMime(mimeType, filename) || isJsonMime(mimeType, filename)) return false
  return mimeType !== 'text/plain'
}

