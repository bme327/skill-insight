import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyNodePosition } from '../editor/index.js'
import { testEdge, testGraph, testNode } from '../testing/graph-builder.js'
import { SkillEditor } from './index.js'

describe('SkillEditor', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders IR nodes, inspector fields, and overlaid findings', () => {
    const graph = testGraph([testNode('build', 'action', { title: 'Build controls', detail: 'npm run build' })])
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={graph}
        findings={[{ ruleId: 'permissions.broad', severity: 'warning', message: 'Broad permission', nodeIds: ['build'] }]}
      />,
    )

    expect(markup).toContain('Inspect Build controls')
    expect(markup).toContain('Broad permission')
    expect(markup).toContain('Source mapping')
  })

  it('exposes go-to-source as a separate control from the node body', () => {
    const graph = testGraph([testNode('build', 'action', { title: 'Build controls', detail: 'npm run build' })])
    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup).toContain('Go to source for Build controls')
    expect(markup).toContain('role="button" tabindex="0"')
    expect(markup).toContain('class="vss-node')
  })

  it('places optional skill search between the skill name and toolbar actions', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={testGraph([testNode('build', 'action')])}
        toolbarSearch={<input aria-label="Go to skill" />}
      />,
    )

    expect(markup).toContain('class="vss-toolbar has-search"')
    expect(markup.indexOf('class="vss-skill-name"')).toBeLessThan(markup.indexOf('class="vss-toolbar-search"'))
    expect(markup.indexOf('class="vss-toolbar-search"')).toBeLessThan(markup.indexOf('class="vss-toolbar-actions"'))
  })

  it('opens in overview with grouping and combinable safety filters', () => {
    const graph = testGraph(
      [
        testNode('build', 'action', { title: 'Build controls' }),
        testNode('register', 'action', { title: 'Register controls' }),
      ],
      [testEdge('build', 'register')],
    )

    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup).toContain('aria-label="Graph detail level"')
    expect(markup).toContain('aria-pressed="true">Overview</button>')
    expect(markup).toContain('>Dangerous</button>')
    expect(markup).toContain('>External</button>')
    expect(markup).toContain('>Findings</button>')
    expect(markup).toContain('Expand 2 action blocks')
    expect(markup).toContain('Collapsed group')
  })

  it('renders edge hover targets and target arrows', () => {
    const graph = testGraph(
      [testNode('build', 'action'), testNode('report', 'condition')],
      [testEdge('build', 'report')],
    )

    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup).toContain('class="vss-edge-hit"')
    expect(markup).toContain('marker-end="url(#')
    expect(markup).toContain('class="vss-edge-arrow"')
  })

  it('exposes zoom and fit controls with the current scale', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor graph={testGraph([testNode('build', 'action')])} />,
    )

    expect(markup).toContain('role="region" aria-label="Graph canvas"')
    expect(markup).toContain('aria-label="Graph zoom controls"')
    expect(markup).toContain('aria-label="Zoom out"')
    expect(markup).toContain('aria-label="Zoom in"')
    expect(markup).toContain('aria-label="Fit graph to view"')
    expect(markup).toContain('class="vss-zoom-label">Zoom</span>')
    expect(markup).toContain('<output aria-live="polite" title="Current graph zoom">100%</output>')
  })

  it('shows a minimap when the graph extends beyond the viewport', () => {
    const graph = applyNodePosition(
      testGraph([testNode('build', 'action')]),
      'build',
      { x: 1_500, y: 1_000 },
    )
    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup).toContain('aria-label="Pan graph using minimap"')
    expect(markup).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End"')
    expect(markup).toContain('class="vss-minimap-viewport"')
  })

  it('renders supporting nodes as selectable attachments with summary tooltips', () => {
    const graph = testGraph(
      [
        testNode('trigger', 'trigger'),
        testNode('input', 'input', { title: 'Argument', detail: 'control name' }),
        testNode('validation', 'validation', { title: 'Wait for readiness', detail: 'port 8181 responds' }),
      ],
      [testEdge('trigger', 'input', 'dataFlow'), testEdge('trigger', 'validation')],
    )

    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup).toContain('is-attached is-attached-small')
    expect(markup).toContain('is-attached is-attached-medium')
    expect(markup).toContain('role="tooltip"')
    expect(markup).toContain('port 8181 responds')
    expect(markup).toContain('Inspect Argument, attached input')
  })

  it('shows a collapse icon on every card from an expanded group', () => {
    const graph = testGraph(
      [testNode('build', 'action'), testNode('register', 'action')],
      [testEdge('build', 'register')],
    )
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({
        level: 'detail',
        activeFilterIds: [],
        groupExpansionOverrides: {},
      }),
      setItem: () => undefined,
    })

    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup.match(/aria-label="Collapse 2 action blocks"/g)).toHaveLength(2)
  })

  it('exposes Markdown preview and source actions beside Detail', () => {
    const graph = testGraph([testNode('build', 'action', { title: 'Build controls', detail: '**Build** the controls.' })])
    const markup = renderToStaticMarkup(<SkillEditor graph={graph} />)

    expect(markup).toContain('aria-label="MD preview"')
    expect(markup).toContain('aria-label="MD"')
    expect(markup).toContain('<dialog')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('class="vss-markdown-dialog"')
  })

  it('omits the AI assessment button when the host offers no handler', () => {
    const markup = renderToStaticMarkup(<SkillEditor graph={testGraph([testNode('build', 'action')])} />)

    expect(markup).not.toContain('AI Assessment')
  })

  it('disables the AI assessment button while no model is available', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={testGraph([testNode('build', 'action')])}
        assessment={{ state: 'unavailable', message: 'Sign in to GitHub Copilot to enable AI assessment.' }}
        onRunAssessment={() => undefined}
      />,
    )

    expect(markup).toContain('AI Assessment')
    expect(markup).toContain('class="vss-ai-button" disabled=""')
    expect(markup).toContain('title="Sign in to GitHub Copilot to enable AI assessment."')
  })

  it('names the model and the cost when the button is ready', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={testGraph([testNode('build', 'action')])}
        assessment={{ state: 'ready', modelLabel: 'GPT-4o (copilot)' }}
        onRunAssessment={() => undefined}
      />,
    )

    expect(markup).toContain('Reviews this skill with GPT-4o (copilot) and uses your Copilot allowance.')
    expect(markup).toContain('aria-label="Run AI assessment of this skill"')
  })

  it('reports progress while the assessment runs', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={testGraph([testNode('build', 'action')])}
        assessment={{ state: 'running', modelLabel: 'GPT-4o (copilot)' }}
        onRunAssessment={() => undefined}
      />,
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Assessing')
  })

  it('keeps the button usable so a failed assessment can be retried', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={testGraph([testNode('build', 'action')])}
        assessment={{ state: 'error', message: 'The request was blocked, or the Copilot quota is exhausted.' }}
        onRunAssessment={() => undefined}
      />,
    )

    expect(markup).toContain('Retry assessment')
    expect(markup).toContain('aria-label="Retry AI assessment of this skill"')
    expect(markup).not.toContain('class="vss-ai-button" disabled=""')
  })

  it('shows the AI summary and marks AI findings as suggestions', () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        graph={testGraph([testNode('build', 'action', { title: 'Build controls' })])}
        findings={[{ ruleId: 'ai/clarity', severity: 'warning', message: 'Step is ambiguous.', nodeIds: ['build'], provenance: 'ai' }]}
        assessment={{ state: 'ready', summary: 'Publishes a build.', lastRunAt: '2026-09-16T10:00:00.000Z' }}
        onRunAssessment={() => undefined}
      />,
    )

    expect(markup).toContain('AI summary')
    expect(markup).toContain('Publishes a build.')
    expect(markup).toContain('ai/clarity · AI suggestion')
  })
})