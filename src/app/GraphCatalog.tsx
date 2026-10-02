import { useEffect, useRef } from 'react'
import type { SkillCatalogGroup } from '../editor/index.js'

export interface ScanStatus {
  readonly scanning: boolean
  readonly scanned: number
  readonly total: number
}

export interface GraphCatalogProps {
  readonly groups: readonly SkillCatalogGroup[]
  readonly selectedUri: string | undefined
  readonly status: ScanStatus
  readonly query: string
  readonly collapsed: boolean
  readonly onQueryChange: (value: string) => void
  readonly onSelect: (uri: string) => void
  readonly onToggle: () => void
}

export function GraphCatalog({
  groups,
  selectedUri,
  status,
  query,
  collapsed,
  onQueryChange,
  onSelect,
  onToggle,
}: GraphCatalogProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  const needle = query.trim().toLowerCase()
  const visible = needle.length === 0
    ? groups
    : groups
      .map((group) => ({
        ...group,
        skills: group.skills.filter((skill) =>
          `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.skills.length > 0)
  const total = visible.reduce((count, group) => count + group.skills.length, 0)

  useEffect(() => {
    if (!collapsed) selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedUri, query, collapsed])

  return (
    <aside
      className={collapsed ? 'skill-catalog collapsed' : 'skill-catalog'}
      aria-label="Discovered skills"
    >
      <div className="catalog-header">
        {!collapsed && <div className="catalog-title">Skills</div>}
        <button
          className="catalog-toggle"
          type="button"
          aria-label={collapsed ? 'Expand skills panel' : 'Collapse skills panel'}
          title={collapsed ? 'Expand skills panel' : 'Collapse skills panel'}
          onClick={onToggle}
        >
          <span aria-hidden="true">{collapsed ? '>' : '<'}</span>
        </button>
      </div>
      {!collapsed && (
        <>
          <input
            className="catalog-filter"
            type="search"
            value={query}
            placeholder="Filter skills…"
            aria-label="Filter skills"
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <div className="sr-only" role="status" aria-live="polite">{total} skills listed</div>
          {status.scanning && (
            <p className="catalog-scanning">
              <span className="catalog-spinner" aria-hidden="true" />
              {status.total === 0
                ? 'Scanning for skills…'
                : `Scanning ${status.scanned} of ${status.total} files…`}
            </p>
          )}
          {!status.scanning && groups.length === 0 && (
            <p className="catalog-empty">No conforming skill files found.</p>
          )}
          {groups.length > 0 && visible.length === 0 && (
            <p className="catalog-empty">No skills match the filter.</p>
          )}
          {visible.map((group) => (
            <section className="catalog-group" key={group.id}>
              <h2>{group.label}</h2>
              {group.skills.map((skill) => (
                <button
                  className={skill.uri === selectedUri ? 'catalog-skill selected' : 'catalog-skill'}
                  type="button"
                  key={skill.uri}
                  ref={skill.uri === selectedUri ? selectedRef : null}
                  title={skill.path}
                  aria-pressed={skill.uri === selectedUri}
                  onClick={() => onSelect(skill.uri)}
                >
                  <strong>{skill.name}</strong>
                  <span>{skill.path}</span>
                </button>
              ))}
            </section>
          ))}
        </>
      )}
    </aside>
  )
}
