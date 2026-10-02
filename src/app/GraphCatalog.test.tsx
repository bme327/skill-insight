import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SkillCatalogGroup } from '../editor/index.js'
import { GraphCatalog } from './GraphCatalog.js'

const groups: readonly SkillCatalogGroup[] = [{
  id: 'workspace',
  label: 'Workspace',
  kind: 'workspace',
  skills: [{
    uri: 'file:///workspace/SKILL.md',
    name: 'release-review',
    description: 'Review a release',
    path: '.github/skills/release-review/SKILL.md',
  }],
}]

const common = {
  groups,
  selectedUri: groups[0]?.skills[0]?.uri,
  status: { scanning: false, scanned: 1, total: 1 },
  query: '',
  onQueryChange: () => undefined,
  onSelect: () => undefined,
  onToggle: () => undefined,
}

describe('GraphCatalog', () => {
  it('shows search and skills while expanded', () => {
    const markup = renderToStaticMarkup(<GraphCatalog {...common} collapsed={false} />)

    expect(markup).toContain('aria-label="Collapse skills panel"')
    expect(markup).toContain('aria-label="Filter skills"')
    expect(markup).toContain('release-review')
  })

  it('reduces to an accessible expand control while collapsed', () => {
    const markup = renderToStaticMarkup(<GraphCatalog {...common} collapsed />)

    expect(markup).toContain('class="skill-catalog collapsed"')
    expect(markup).toContain('aria-label="Expand skills panel"')
    expect(markup).not.toContain('aria-label="Filter skills"')
    expect(markup).not.toContain('release-review')
  })
})
