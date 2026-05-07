import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RightPanel, type RightPanelTab } from './RightPanel'

describe('RightPanel', () => {
  const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const originalActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    if (originalActEnvironment === undefined) {
      delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
    } else {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
    }
  })

  it('只渲染当前选中的 tab 内容', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSelectTab = vi.fn()
    const tabs: RightPanelTab[] = [
      { id: 'files', kind: 'files', title: 'Files', content: <div>file tree</div> },
      { id: 'doc', kind: 'document', title: 'random-doc', content: <div>doc body</div> },
    ]

    await act(async () => {
      root.render(<RightPanel tabs={tabs} activeTabId="files" onSelectTab={onSelectTab} />)
    })

    expect(container.textContent).toContain('file tree')
    expect(container.textContent).not.toContain('doc body')

    await act(async () => {
      container.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectTab).toHaveBeenCalledWith('doc')

    await act(async () => {
      root.render(<RightPanel tabs={tabs} activeTabId="doc" onSelectTab={onSelectTab} />)
    })

    expect(container.textContent).not.toContain('file tree')
    expect(container.textContent).toContain('doc body')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('关闭按钮不触发 tab 选择', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSelectTab = vi.fn()
    const onCloseTab = vi.fn()

    await act(async () => {
      root.render(
        <RightPanel
          tabs={[{ id: 'doc', kind: 'document', title: 'random-doc', content: <div>doc body</div> }]}
          activeTabId="doc"
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />,
      )
    })

    await act(async () => {
      container.querySelector('[aria-label="Close random-doc"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onCloseTab).toHaveBeenCalledWith('doc')
    expect(onSelectTab).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-label="Close random-doc"]')?.className).toContain('absolute')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
