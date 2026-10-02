import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { hostMessageSchema } from '../editor/index.js'
import type { SkillCatalogEntry, SkillCatalogGroup, WebviewMessage } from '../editor/index.js'
import './catalog.css'

interface VsCodeApi {
  postMessage(message: WebviewMessage): void
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

interface ScanStatus {
  readonly scanning: boolean
  readonly scanned: number
  readonly total: number
}

const IDLE_STATUS: ScanStatus = { scanning: false, scanned: 0, total: 0 }

function matches(skill: SkillCatalogEntry, query: string): boolean {
  return `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(query)
}

function scanLabel(status: ScanStatus): string {
  return status.total === 0
    ? 'Scanning for skills…'
    : `Scanning ${status.scanned} of ${status.total} files…`
}

function CatalogView() {
  const [groups, setGroups] = useState<readonly SkillCatalogGroup[]>([])
  const [selectedUri, setSelectedUri] = useState<string | undefined>()
  const [status, setStatus] = useState<ScanStatus>(IDLE_STATUS)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<readonly string[]>([])
  const selectedRef = useRef<HTMLButtonElement | null>(null)

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
      if (message.type === 'filter') {
        setQuery(message.value)
        return
      }
      if (message.type === 'status') {
        setStatus({ scanning: message.scanning, scanned: message.scanned, total: message.total })
      }
    }
    window.addEventListener('message', receive)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', receive)
  }, [])

  // A selection made in the graph panel must not stay hidden behind a collapsed group.
  useEffect(() => {
    if (selectedUri === undefined) return
    const owner = groups.find((group) => group.skills.some((skill) => skill.uri === selectedUri))
    if (owner !== undefined) setCollapsed((current) => current.filter((id) => id !== owner.id))
  }, [selectedUri, groups])

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedUri, collapsed, query])

  const changeQuery = (value: string): void => {
    setQuery(value)
    vscode.postMessage({ type: 'setFilter', value })
  }

  const needle = query.trim().toLowerCase()
  const visible = needle.length === 0
    ? groups
    : groups
      .map((group) => ({ ...group, skills: group.skills.filter((skill) => matches(skill, needle)) }))
      .filter((group) => group.skills.length > 0)
  const total = visible.reduce((count, group) => count + group.skills.length, 0)

  return (
    <div className="catalog">
      <div className="catalog-search">
        <input
          type="search"
          value={query}
          placeholder="Filter skills…"
          aria-label="Filter skills"
          onChange={(event) => changeQuery(event.target.value)}
        />
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {status.scanning ? scanLabel(status) : `${total} skills listed`}
      </div>

      {status.scanning && (
        <p className="catalog-note">
          <span className="catalog-spinner" aria-hidden="true" />
          {scanLabel(status)}
        </p>
      )}
      {!status.scanning && groups.length === 0 && (
        <p className="catalog-note">No conforming skill files were found.</p>
      )}
      {groups.length > 0 && visible.length === 0 && (
        <p className="catalog-note">No skills match “{query.trim()}”.</p>
      )}

      <ul className="catalog-groups">
        {visible.map((group) => {
          const isCollapsed = collapsed.includes(group.id)
          return (
            <li key={group.id}>
              <button
                type="button"
                className="catalog-group"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((current) =>
                  current.includes(group.id)
                    ? current.filter((id) => id !== group.id)
                    : [...current, group.id])}
              >
                <span className={isCollapsed ? 'catalog-twisty collapsed' : 'catalog-twisty'} aria-hidden="true" />
                <span className="catalog-group-label">{group.label}</span>
                <span className="catalog-count">{group.skills.length}</span>
              </button>
              {!isCollapsed && (
                <ul className="catalog-skills">
                  {group.skills.map((skill) => (
                    <li key={skill.uri}>
                      <button
                        type="button"
                        ref={skill.uri === selectedUri ? selectedRef : null}
                        className={skill.uri === selectedUri ? 'catalog-skill selected' : 'catalog-skill'}
                        title={`${skill.name}\n${skill.description}\n${skill.path}`}
                        aria-current={skill.uri === selectedUri}
                        onClick={() => vscode.postMessage({ type: 'selectSkill', uri: skill.uri })}
                      >
                        <span className="catalog-skill-name">{skill.name}</span>
                        <span className="catalog-skill-path">{skill.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const root = document.getElementById('root')
if (root !== null) createRoot(root).render(<StrictMode><CatalogView /></StrictMode>)
