import { describe, expect, it } from 'vitest'
import { createDefaultParserRegistry } from '../parsers/index.js'
import { testGraph, testNode } from '../testing/graph-builder.js'
import { ALLOWED_ROOT, loadFixture } from '../testing/load-fixture.js'
import { REDACTED, redactSecrets } from './redact.js'

const parsers = createDefaultParserRegistry()

function graphOf(fixture: string) {
  return parsers.parse(loadFixture(fixture), { allowedRoot: ALLOWED_ROOT }).graph
}

describe('redactSecrets', () => {
  it('removes credential-shaped values from titles and details', () => {
    const graph = testGraph([
      testNode('n1', 'action', {
        title: 'Deploy with AKIAIOSFODNN7EXAMPLE',
        detail: 'Set api_key: sk_live_7Hn2Qp91ZzLm44xR and call the endpoint.',
      }),
    ])

    const { graph: redacted, redactions } = redactSecrets(graph)

    expect(redactions).toBe(2)
    expect(redacted.nodes[0]?.title).toBe(`Deploy with ${REDACTED}`)
    expect(redacted.nodes[0]?.detail).toContain(`api_key: ${REDACTED}`)
    expect(redacted.nodes[0]?.detail).not.toContain('sk_live_7Hn2Qp91ZzLm44xR')
  })

  it('redacts bearer tokens, JWTs and private key blocks', () => {
    const graph = testGraph([
      testNode('n1', 'toolCall', {
        detail: [
          'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
          '-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----',
        ].join('\n'),
      }),
    ])

    const { redactions, graph: redacted } = redactSecrets(graph)

    expect(redactions).toBe(3)
    expect(redacted.nodes[0]?.detail).not.toMatch(/BEGIN RSA PRIVATE KEY/)
  })

  it('redacts every field the prompt sends, including name and declared tools', () => {
    const graph = {
      ...testGraph([testNode('n1', 'action')]),
      name: 'deploy AKIAIOSFODNN7EXAMPLE',
      description: 'Runs with token: 0123456789abcdef0123',
      declaredTools: ['github_search', 'curl --header "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123"'],
    }

    const { graph: redacted, redactions } = redactSecrets(graph)

    expect(redactions).toBe(3)
    expect(redacted.name).toBe(`deploy ${REDACTED}`)
    expect(redacted.description).toContain(REDACTED)
    expect(redacted.declaredTools[0]).toBe('github_search')
    expect(redacted.declaredTools[1]).not.toContain('abcdefghijklmnopqrstuvwxyz0123')
  })

  it('leaves a clean skill untouched', () => {
    const graph = graphOf('clean/SKILL.md')

    const { graph: redacted, redactions } = redactSecrets(graph)

    expect(redactions).toBe(0)
    expect(redacted).toEqual(graph)
  })

  it('does not fire on prose that merely mentions a secret', () => {
    const graph = testGraph([
      testNode('n1', 'instruction', {
        detail: 'Ask the operator for the API key and never write the password down.',
      }),
    ])

    expect(redactSecrets(graph).redactions).toBe(0)
  })

  it('does not mutate the input graph', () => {
    const graph = testGraph([testNode('n1', 'action', { detail: 'token = 0123456789abcdef' })])
    const before = structuredClone(graph)

    redactSecrets(graph)

    expect(graph).toEqual(before)
  })
})
