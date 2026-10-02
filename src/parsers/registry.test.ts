import { describe, expect, it } from 'vitest'
import { createMarkdownSkillAdapter } from './markdown/adapter.js'
import { createParserRegistry } from './registry.js'
import type { ParserAdapter } from './types.js'

const options = { allowedRoot: 'workspace' }

describe('createParserRegistry', () => {
  it('picks the first adapter that claims the file', () => {
    const registry = createParserRegistry([createMarkdownSkillAdapter()])
    expect(registry.detect({ uri: 'a.md', content: '' })?.id).toBe('markdown-skill')
    expect(registry.detect({ uri: 'a.json', content: '' })).toBeUndefined()
  })

  it('reports an unsupported format instead of throwing', () => {
    const registry = createParserRegistry([createMarkdownSkillAdapter()])
    const { graph, findings } = registry.parse({ uri: 'skill.json', content: '{}' }, options)
    expect(graph.nodes).toEqual([])
    expect(findings.map((finding) => finding.ruleId)).toEqual(['parse/unsupported-format'])
  })

  it('accepts a new provider without any change to the registry', () => {
    const jsonAdapter: ParserAdapter = {
      id: 'json-skill',
      provider: 'json',
      detect: (file) => file.uri.endsWith('.json'),
      recognize: (file) => file.content.startsWith('{'),
      parse: (file) => ({
        graph: {
          schemaVersion: '1.0.0',
          id: 'skill',
          name: 'json',
          description: '',
          provider: 'json',
          sourceUri: file.uri,
          declaredTools: [],
          nodes: [],
          edges: [],
          raw: {},
        },
        findings: [],
      }),
    }
    const registry = createParserRegistry([createMarkdownSkillAdapter(), jsonAdapter])
    expect(registry.parse({ uri: 'skill.json', content: '{}' }, options).graph.provider).toBe('json')
  })

  it('exposes an adapter list the caller cannot mutate', () => {
    const registry = createParserRegistry([createMarkdownSkillAdapter()])
    expect(Object.isFrozen(registry.adapters)).toBe(true)
  })
})
