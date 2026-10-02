import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { hostMessageSchema } from '../editor/index.js'
import type { AssessmentStatus, SkillCatalogGroup, WebviewMessage } from '../editor/index.js'
import type { Finding, SkillGraph, SourceSpan } from '../ir/index.js'
import { GraphCatalog } from './GraphCatalog.js'
import type { ScanStatus } from './GraphCatalog.js'
import { SkillEditor } from './SkillEditor.js'
import { SkillSearch } from './SkillSearch.js'
import './webview.css'

interface VsCodeApi {
  postMessage(message: WebviewMessage): void
}

const IDLE_STATUS: ScanStatus = { scanning: false, scanned: 0, total: 0 }

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

function App() {
  const [graph, setGraph] = useState<SkillGraph | undefined>()
  const [findings, setFindings] = useState<readonly Finding[]>([])
  const [placeholder, setPlaceholder] = useState('Select a skill to inspect its graph.')
  const [groups, setGroups] = useState<readonly SkillCatalogGroup[]>([])
  const [selectedUri, setSelectedUri] = useState<string | undefined>()
  const [status, setStatus] = useState<ScanStatus>(IDLE_STATUS)
  const [query, setQuery] = useState('')
  const [catalogCollapsed, setCatalogCollapsed] = useState(false)
  const [assessment, setAssessment] = useState<AssessmentStatus>({ state: 'unavailable' })

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>): void => {
      const parsed = hostMessageSchema.safeParse(event.data)
      if (!parsed.success) return
      const message = parsed.data
      if (message.type === 'catalog') {
        setGroups(message.groups)
        setSelectedUri(message.selectedUri)
        return
      }
      if (message.type === 'assessment') {
        const { type: _type, ...rest } = message
        setAssessment(rest)
        return
      }
      if (message.type === 'status') {
        setStatus({ scanning: message.scanning, scanned: message.scanned, total: message.total })
        return
      }
      if (message.type === 'filter') {
        setQuery(message.value)
        return
      }
      if (message.type === 'empty') {
        setGraph(undefined)
        setFindings([])
        setPlaceholder(message.message)
        return
      }
      setGraph(message.graph)
      setFindings(message.findings)
      setSelectedUri(message.graph.sourceUri)
    }
    window.addEventListener('message', receive)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', receive)
  }, [])

  return (
    <div className={catalogCollapsed ? 'app-shell catalog-collapsed' : 'app-shell'}>
      <GraphCatalog
        groups={groups}
        selectedUri={selectedUri}
        status={status}
        query={query}
        collapsed={catalogCollapsed}
        onQueryChange={(value) => {
          setQuery(value)
          vscode.postMessage({ type: 'setFilter', value })
        }}
        onSelect={(uri) => vscode.postMessage({ type: 'selectSkill', uri })}
        onToggle={() => setCatalogCollapsed((current) => !current)}
      />
      <main className="graph-host">
        <div className="sr-only" role="status" aria-live="polite">
          {graph === undefined
            ? placeholder
            : `Loaded ${graph.nodes.length} blocks with ${findings.length} findings.`}
        </div>
        <div className="graph-content">
          {graph === undefined ? (
            <p className="empty-state">
              {status.scanning
                ? (status.total === 0
                  ? 'Scanning for skills…'
                  : `Scanning ${status.scanned} of ${status.total} files…`)
                : placeholder}
            </p>
          ) : (
            <SkillEditor
              className="graph-editor"
              graph={graph}
              findings={findings}
              assessment={assessment}
              toolbarSearch={(
                <SkillSearch
                  groups={groups}
                  onSelect={(uri) => vscode.postMessage({ type: 'selectSkill', uri })}
                />
              )}
              onRevealSource={(source: SourceSpan) => vscode.postMessage({ type: 'revealSource', source })}
              onRunAssessment={(force: boolean) => vscode.postMessage({ type: 'runAssessment', force })}
            />
          )}
        </div>
      </main>
    </div>
  )
}

const root = document.getElementById('root')
if (root !== null) createRoot(root).render(<StrictMode><App /></StrictMode>)
