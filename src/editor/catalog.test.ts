import { describe, expect, it } from 'vitest'
import { groupCatalog } from './catalog.js'

describe('groupCatalog', () => {
  it('groups by location with workspace entries first', () => {
    const groups = groupCatalog([
      {
        groupId: 'personal', groupLabel: 'Personal · Agent skills', kind: 'personal',
        skill: { uri: 'file:///home/.agents/b.md', name: 'Beta', description: '', path: 'b.md' },
      },
      {
        groupId: 'workspace', groupLabel: 'skill-insights · .github', kind: 'workspace',
        skill: { uri: 'file:///repo/z.md', name: 'Zulu', description: '', path: '.github/z.md' },
      },
      {
        groupId: 'workspace', groupLabel: 'skill-insights · .github', kind: 'workspace',
        skill: { uri: 'file:///repo/a.md', name: 'Alpha', description: '', path: '.github/a.md' },
      },
    ])

    expect(groups.map((group) => group.label)).toEqual([
      'skill-insights · .github',
      'Personal · Agent skills',
    ])
    expect(groups[0]?.skills.map((skill) => skill.name)).toEqual(['Alpha', 'Zulu'])
  })
})