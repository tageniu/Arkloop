import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import { getDesktopApi, type LocalFileEntry } from '@arkloop/shared/desktop'
import './LocalFileTree.css'

export type LocalFileResourceRef = {
  kind: 'local-file'
  rootPath: string
  path: string
  name?: string
}

export type LocalFileTreeProps = {
  rootPath: string
  onOpenFile: (ref: LocalFileResourceRef) => void
  className?: string
}

type DirectoryState =
  | { status: 'loading'; entries: LocalFileEntry[] }
  | { status: 'ready'; entries: LocalFileEntry[] }
  | { status: 'error'; entries: LocalFileEntry[] }

type TreeState = {
  rootPath: string
  expanded: Set<string>
  directories: Record<string, DirectoryState>
}

const ROOT_KEY = ''

function directoryKey(path: string | undefined): string {
  return path?.replace(/^\/+|\/+$/g, '') ?? ROOT_KEY
}

function displayRootName(rootPath: string): string {
  const normalized = rootPath.replace(/[\\/]+$/g, '')
  return normalized.split(/[\\/]/).pop() || normalized || rootPath
}

function displayPath(rootPath: string, path?: string): string {
  const cleanRoot = rootPath.replace(/[\\/]+$/g, '')
  const cleanPath = path?.replace(/^[/\\]+/g, '') ?? ''
  return cleanPath ? `${cleanRoot}/${cleanPath}` : rootPath
}

function sortEntries(entries: LocalFileEntry[]): LocalFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function LocalFileTree({ rootPath, onOpenFile, className }: LocalFileTreeProps) {
  const [treeState, setTreeState] = useState<TreeState>(() => ({
    rootPath: '',
    expanded: new Set([ROOT_KEY]),
    directories: {},
  }))

  const rootLabel = useMemo(() => displayRootName(rootPath), [rootPath])
  const expanded = useMemo(
    () => (treeState.rootPath === rootPath ? treeState.expanded : new Set([ROOT_KEY])),
    [rootPath, treeState.expanded, treeState.rootPath],
  )
  const directories = useMemo(
    () => (treeState.rootPath === rootPath ? treeState.directories : {}),
    [rootPath, treeState.directories, treeState.rootPath],
  )
  const rootState = directories[ROOT_KEY]

  const loadDirectory = useCallback((subPath?: string) => {
    const key = directoryKey(subPath)
    if (!rootPath) return

    setTreeState((current) => {
      const sameRoot = current.rootPath === rootPath
      const directoriesForRoot = sameRoot ? current.directories : {}
      return {
        rootPath,
        expanded: sameRoot ? current.expanded : new Set([ROOT_KEY]),
        directories: {
          ...directoriesForRoot,
          [key]: { status: 'loading', entries: directoriesForRoot[key]?.entries ?? [] },
        },
      }
    })

    const fs = getDesktopApi()?.fs
    if (!fs) {
      setTreeState((current) => ({
        ...current,
        directories: {
          ...current.directories,
          [key]: { status: 'error', entries: current.directories[key]?.entries ?? [] },
        },
      }))
      return
    }

    fs.listDir(rootPath, subPath)
      .then((result) => {
        setTreeState((current) => ({
          ...current,
          directories: {
            ...current.directories,
            [key]: { status: 'ready', entries: sortEntries(result.entries) },
          },
        }))
      })
      .catch(() => {
        setTreeState((current) => ({
          ...current,
          directories: {
            ...current.directories,
            [key]: { status: 'error', entries: current.directories[key]?.entries ?? [] },
          },
        }))
      })
  }, [rootPath])

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) loadDirectory()
    })
    return () => {
      cancelled = true
    }
  }, [loadDirectory, rootPath])

  const toggleDirectory = useCallback((entry: LocalFileEntry) => {
    const key = directoryKey(entry.path)
    setTreeState((current) => {
      const sameRoot = current.rootPath === rootPath
      const next = new Set(sameRoot ? current.expanded : [ROOT_KEY])
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return {
        rootPath,
        expanded: next,
        directories: sameRoot ? current.directories : {},
      }
    })
    if (!directories[key]) loadDirectory(entry.path)
  }, [directories, loadDirectory, rootPath])

  const openFile = useCallback((entry: LocalFileEntry) => {
    onOpenFile({
      kind: 'local-file',
      rootPath,
      path: entry.path,
      name: entry.name,
    })
  }, [onOpenFile, rootPath])

  const renderDirectoryRows = (parentPath: string | undefined, level: number) => {
    const key = directoryKey(parentPath)
    const state = directories[key]
    const entries = state?.entries ?? []
    const indent = level * 16 + 24

    if (!state || state.status === 'loading') {
      return <div className="local-file-tree__meta" style={{ paddingLeft: indent }}>Loading</div>
    }

    if (state.status === 'error') {
      return <div className="local-file-tree__meta" style={{ paddingLeft: indent }}>Unable to read</div>
    }

    if (entries.length === 0) {
      return <div className="local-file-tree__meta" style={{ paddingLeft: indent }}>Empty</div>
    }

    return entries.map((entry) => {
      const entryDirectoryKey = directoryKey(entry.path)
      const isExpanded = expanded.has(entryDirectoryKey)
      const isDirectory = entry.type === 'dir'
      const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : File

      return (
        <div key={`${entry.type}:${entry.path}`}>
          <button
            type="button"
            className="local-file-tree__row"
            style={{ paddingLeft: level * 16 + 6 }}
            title={displayPath(rootPath, entry.path)}
            data-path={entry.path}
            onClick={() => (isDirectory ? toggleDirectory(entry) : openFile(entry))}
          >
            <span className="local-file-tree__twisty" aria-hidden="true">
              {isDirectory ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
            </span>
            <Icon className="local-file-tree__icon" size={14} aria-hidden="true" />
            <span className="local-file-tree__name">{entry.name}</span>
          </button>
          {isDirectory && isExpanded ? renderDirectoryRows(entry.path, level + 1) : null}
        </div>
      )
    })
  }

  return (
    <section className={['local-file-tree', className].filter(Boolean).join(' ')} aria-label="Local files">
      {rootPath ? (
        <>
          <div className="local-file-tree__root" title={rootPath}>
            <FolderOpen size={14} aria-hidden="true" />
            <span className="local-file-tree__root-name">{rootLabel}</span>
            <span className="local-file-tree__root-path">{rootPath}</span>
          </div>
          <div className="local-file-tree__body">
            {rootState ? renderDirectoryRows(undefined, 0) : null}
          </div>
        </>
      ) : (
        <div className="local-file-tree__meta local-file-tree__meta--standalone">No folder selected</div>
      )}
    </section>
  )
}
