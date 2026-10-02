import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SkillCatalogGroup } from '../editor/index.js'
import { findSkillMatches, SkillSearch, splitSkillNameMatch } from './SkillSearch.js'

const groups: readonly SkillCatalogGroup[] = [{
  id: 'workspace',
  label: 'Workspace',
  kind: 'workspace',
  skills: [
    {
      uri: 'file:///workspace/caveman/SKILL.md',
      name: 'caveman',
      description: 'Primary cave skill',
      path: '.github/skills/caveman/SKILL.md',
    },
    {
      uri: 'file:///workspace/caveman-lite/SKILL.md',
      name: 'caveman-lite',
      description: 'Lightweight cave skill',
      path: '.github/skills/caveman-lite/SKILL.md',
    },
    {
      uri: 'file:///workspace/release/SKILL.md',
      name: 'CommentComprehension',
      description: 'Understand comments',
      path: '.github/skills/comment-comprehension/SKILL.md',
    },
    {
      uri: 'file:///workspace/suppress/SKILL.md',
      name: 'CommentSuppression',
      description: 'Suppress comments',
      path: '.github/skills/comment-suppression/SKILL.md',
    },
    {
      uri: 'file:///workspace/remove/SKILL.md',
      name: 'RemoveComment',
      description: 'Remove comments',
      path: '.github/skills/remove-comment/SKILL.md',
    },
  ],
}]

describe('SkillSearch', () => {
  it('finds matching skill names and ranks prefix matches first', () => {
    expect(findSkillMatches(groups, 'cave').map((skill) => skill.name)).toEqual([
      'caveman',
      'caveman-lite',
    ])
  })

  it('places prefix matches before containing matches and identifies text to highlight', () => {
    expect(findSkillMatches(groups, 'comment').map((skill) => skill.name)).toEqual([
      'CommentComprehension',
      'CommentSuppression',
      'RemoveComment',
    ])
    expect(splitSkillNameMatch('RemoveComment', 'comment')).toEqual({
      before: 'Remove',
      match: 'Comment',
      after: '',
    })
  })

  it('keeps every matching skill available in the scrollable result list', () => {
    const manyGroups: readonly SkillCatalogGroup[] = [{
      id: 'many',
      label: 'Many skills',
      kind: 'workspace',
      skills: Array.from({ length: 12 }, (_, index) => ({
        uri: `file:///workspace/release-${index}/SKILL.md`,
        name: `release-${index}`,
        description: `Release skill ${index}`,
        path: `.github/skills/release-${index}/SKILL.md`,
      })),
    }]

    expect(findSkillMatches(manyGroups, 'release')).toHaveLength(12)
  })

  it('renders an accessible skill combobox', () => {
    const markup = renderToStaticMarkup(<SkillSearch groups={groups} onSelect={() => undefined} />)

    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-label="Go to skill"')
    expect(markup).toContain('placeholder="Go to skill')
  })
})
