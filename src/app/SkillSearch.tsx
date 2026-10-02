import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { SkillCatalogEntry, SkillCatalogGroup } from '../editor/index.js'

export interface SkillSearchProps {
  readonly groups: readonly SkillCatalogGroup[]
  readonly onSelect: (uri: string) => void
}

export interface SkillNameMatch {
  readonly before: string
  readonly match: string
  readonly after: string
}

export function splitSkillNameMatch(name: string, query: string): SkillNameMatch | undefined {
  const needle = query.trim()
  if (needle === '') return undefined
  const index = name.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return undefined
  return {
    before: name.slice(0, index),
    match: name.slice(index, index + needle.length),
    after: name.slice(index + needle.length),
  }
}

export function findSkillMatches(
  groups: readonly SkillCatalogGroup[],
  query: string,
): readonly SkillCatalogEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  return groups
    .flatMap((group) => group.skills)
    .filter((skill) => skill.name.toLowerCase().includes(needle))
    .sort((left, right) => {
      const leftStarts = left.name.toLowerCase().startsWith(needle)
      const rightStarts = right.name.toLowerCase().startsWith(needle)
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
      return left.name.localeCompare(right.name)
    })
}

export function SkillSearch({ groups, onSelect }: SkillSearchProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [focused, setFocused] = useState(false)
  const activeOptionRef = useRef<HTMLButtonElement | null>(null)
  const listboxId = useId()
  const matches = findSkillMatches(groups, query)
  const showResults = focused && query.trim() !== ''
  const active = matches[Math.min(activeIndex, Math.max(0, matches.length - 1))]

  useEffect(() => {
    if (showResults) activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active?.uri, showResults])

  const select = (skill: SkillCatalogEntry): void => {
    onSelect(skill.uri)
    setQuery('')
    setActiveIndex(0)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setQuery('')
      setActiveIndex(0)
      return
    }
    if (matches.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter' && active !== undefined) {
      event.preventDefault()
      select(active)
    }
  }

  return (
    <div className="skill-search">
      <input
        type="search"
        role="combobox"
        value={query}
        placeholder="Go to skill…"
        aria-label="Go to skill"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showResults}
        aria-activedescendant={showResults && active !== undefined
          ? `${listboxId}-${encodeURIComponent(active.uri)}`
          : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
      />
      {showResults && (
        <div className="skill-search-results" id={listboxId} role="listbox" aria-label="Matching skills">
          {matches.length === 0 ? (
            <p role="status">No matching skills</p>
          ) : matches.map((skill) => {
            const nameMatch = splitSkillNameMatch(skill.name, query)
            return (
              <button
                type="button"
                role="option"
                id={`${listboxId}-${encodeURIComponent(skill.uri)}`}
                aria-selected={skill.uri === active?.uri}
                key={skill.uri}
                title={skill.path}
                ref={skill.uri === active?.uri ? activeOptionRef : null}
                onMouseDown={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}
                onClick={() => select(skill)}
              >
                <span className="skill-search-name">
                  {nameMatch === undefined ? skill.name : (
                    <>
                      {nameMatch.before}
                      <span className="skill-search-match">{nameMatch.match}</span>
                      {nameMatch.after}
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
