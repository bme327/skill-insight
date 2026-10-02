import { describe, expect, it } from 'vitest'
import { safeParseSkillGraph } from '../../ir/index.js'
import { ALLOWED_ROOT, loadFixture } from '../../testing/load-fixture.js'
import { createMarkdownSkillAdapter } from './adapter.js'

const adapter = createMarkdownSkillAdapter()
const options = { allowedRoot: ALLOWED_ROOT }

describe('detect', () => {
  it('claims markdown files', () => {
    expect(adapter.detect({ uri: 'skills/SKILL.md', content: '' })).toBe(true)
    expect(adapter.detect({ uri: 'a.instructions.md', content: '' })).toBe(true)
  })

  it('ignores everything else', () => {
    expect(adapter.detect({ uri: 'skill.json', content: '' })).toBe(false)
    expect(adapter.detect({ uri: 'README.mdx', content: '' })).toBe(false)
  })
})

describe('recognize', () => {
  it('accepts a skill with valid frontmatter', () => {
    expect(adapter.recognize(loadFixture('clean/SKILL.md'))).toBe(true)
  })

  it('rejects missing, malformed, and empty frontmatter', () => {
    expect(adapter.recognize(loadFixture('malformed/no-frontmatter.md'))).toBe(false)
    expect(adapter.recognize(loadFixture('malformed/bad-frontmatter.md'))).toBe(false)
    expect(adapter.recognize({ uri: 'empty.md', content: '---\n---\n# Empty' })).toBe(false)
  })
})

describe('preview-build golden graph', () => {
  const file = loadFixture('preview-build/SKILL.md')
  const { graph, findings } = adapter.parse(file, options)

  it('matches the committed graph', async () => {
    await expect(`${JSON.stringify(graph, null, 2)}\n`).toMatchFileSnapshot(
      '../../../fixtures/preview-build/expected-graph.json',
    )
  })

  it('produces a schema-valid graph with no parse findings', () => {
    expect(safeParseSkillGraph(graph).success).toBe(true)
    expect(findings).toEqual([])
  })

  it('reads the declared metadata', () => {
    expect(graph.name).toBe('preview-build')
    expect(graph.declaredTools).toEqual(['create_and_run_task', 'terminal_last_command'])
    expect(graph.nodes.filter((node) => node.kind === 'trigger')).toHaveLength(1)
    expect(graph.nodes.filter((node) => node.kind === 'permission')).toHaveLength(1)
    expect(graph.nodes.filter((node) => node.kind === 'input')).toHaveLength(1)
  })

  it('classifies the steps by what they do', () => {
    const byTitle = new Map(graph.nodes.map((node) => [node.title, node.kind]))
    expect(byTitle.get('Start the local preview server with create_and_run_task')).toBe('toolCall')
    expect(byTitle.get('Wait for the readiness signal on port 8181')).toBe('validation')
    expect(byTitle.get('Report the preview URL to the user')).toBe('output')
    const errorNode = graph.nodes.find((node) => node.kind === 'errorPath')
    expect(errorNode?.detail).toBe(
      'If the build fails, report the diagnostics from terminal_last_command.',
    )
  })

  // "When the user invokes /preview-build:" introduces the list; it is not a branch.
  it('does not turn the list lead-in into a condition', () => {
    expect(graph.nodes.some((node) => node.kind === 'condition')).toBe(false)
  })

  it('routes failure through an onError edge, not the main chain', () => {
    const errorNode = graph.nodes.find((node) => node.kind === 'errorPath')
    expect(errorNode).toBeDefined()
    const inbound = graph.edges.filter((edge) => edge.to === errorNode?.id)
    expect(inbound.map((edge) => edge.kind)).toEqual(['onError'])
  })

  // Spans drive source navigation, so they are asserted against the real text.
  it('anchors every node at the text it came from', () => {
    for (const node of graph.nodes) {
      const slice = file.content.slice(node.source.start.offset, node.source.end.offset)
      expect(slice.length).toBeGreaterThan(0)
      expect(node.source.start.offset).toBeLessThan(node.source.end.offset)
    }
    const build = graph.nodes.find((node) => node.title.startsWith('Build the shared libraries'))
    expect(build).toBeDefined()
    expect(file.content.slice(build?.source.start.offset ?? 0, build?.source.end.offset ?? 0)).toBe(
      'Build the shared libraries and the selected package.',
    )
  })

  it('records the tool as declared and the guide as a resolvable reference', () => {
    const toolCall = graph.nodes.find((node) => node.kind === 'toolCall')
    expect(toolCall?.capabilities).toContainEqual({
      kind: 'tool',
      value: 'create_and_run_task',
      declared: true,
    })
    const reference = graph.nodes.find((node) => node.kind === 'reference')
    expect(reference?.raw).toEqual({ resolved: 'fixtures/docs/packages.md', rejection: null })
  })

  it('does not mistake the slash command for a file reference', () => {
    expect(
      graph.nodes.some((node) => node.kind === 'reference' && node.title === '/preview-build'),
    ).toBe(false)
  })
})

describe('complex debugger fixture', () => {
  it('preserves fenced Markdown structure in node detail', () => {
    const file = loadFixture('complex/SKILL.md')
    const { graph } = adapter.parse(file, options)
    const template = graph.nodes.find((node) => node.title.startsWith('## Release review summary'))

    expect(graph.nodes.length).toBeGreaterThan(40)
    expect(template?.detail).toContain('\n\n| Gate | Owner | Result |\n')
    expect(template?.detail).toContain('\n- [x] Source reviewed\n')
  })
})

describe('malformed input', () => {
  it('reports an empty document instead of throwing', () => {
    const { graph, findings } = adapter.parse(loadFixture('malformed/empty.md'), options)
    expect(graph.nodes).toEqual([])
    expect(findings.map((finding) => finding.ruleId)).toEqual(['parse/empty-document'])
  })

  it('reports invalid frontmatter and still parses the body', () => {
    const { graph, findings } = adapter.parse(loadFixture('malformed/bad-frontmatter.md'), options)
    expect(findings.map((finding) => finding.ruleId)).toContain('parse/frontmatter-invalid')
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(safeParseSkillGraph(graph).success).toBe(true)
  })

  it('falls back to the file name when frontmatter is absent', () => {
    const { graph, findings } = adapter.parse(loadFixture('malformed/no-frontmatter.md'), options)
    expect(graph.name).toBe('no-frontmatter')
    expect(findings.map((finding) => finding.ruleId)).toEqual(['parse/frontmatter-missing'])
    expect(graph.nodes.some((node) => node.kind === 'trigger')).toBe(true)
  })
})

describe('adversarial input', () => {
  const { graph } = adapter.parse(loadFixture('adversarial/path-traversal.md'), options)
  const references = graph.nodes.filter((node) => node.kind === 'reference')

  it('records why each unsafe reference was refused', () => {
    const byTitle = new Map(references.map((node) => [node.title, node.raw['rejection']]))
    expect(byTitle.get('docs/guide.md')).toBeNull()
    expect(byTitle.get('../../.env')).toBe('escapes-root')
    expect(byTitle.get('/etc/passwd')).toBe('absolute')
  })

  it('never resolves a reference that left the allowed root', () => {
    for (const reference of references) {
      const resolved = reference.raw['resolved']
      if (typeof resolved === 'string') expect(resolved.startsWith(`${ALLOWED_ROOT}/`)).toBe(true)
    }
  })

  it('treats a remote link as a network capability rather than a file', () => {
    const fetchNode = graph.nodes.find((node) => node.title.startsWith('Fetch'))
    expect(fetchNode?.capabilities).toContainEqual({
      kind: 'network',
      value: 'https://example.invalid/helper.sh',
      declared: false,
    })
  })
})
