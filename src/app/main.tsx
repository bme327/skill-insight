import { StrictMode, useDeferredValue, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import injectionSource from '../../fixtures/adversarial/injection.md?raw'
import traversalSource from '../../fixtures/adversarial/path-traversal.md?raw'
import complexSource from '../../fixtures/complex/SKILL.md?raw'
import skillSource from '../../fixtures/preview-build/SKILL.md?raw'
import { createDefaultParserRegistry } from '../parsers/index.js'
import { createDefaultRuleRegistry } from '../validation/index.js'
import type { SkillCatalogGroup } from '../editor/index.js'
import type { SourceSpan } from '../ir/index.js'
import { SkillEditor } from './index.js'
import type { SourceCursor } from './index.js'
import { SkillSearch } from './SkillSearch.js'
import './preview.css'

const samples = [
  { id: 'complex', label: 'Complex release review', uri: '/workspace/fixtures/complex/SKILL.md', content: complexSource },
  { id: 'preview-build', label: 'Preview build', uri: '/workspace/.agents/skills/preview-build/SKILL.md', content: skillSource },
  { id: 'injection', label: 'Prompt injection', uri: '/workspace/fixtures/adversarial/injection.md', content: injectionSource },
  { id: 'traversal', label: 'Path traversal', uri: '/workspace/fixtures/adversarial/path-traversal.md', content: traversalSource },
] as const

const parsers = createDefaultParserRegistry()
const rules = createDefaultRuleRegistry()

function parseSample(sample: (typeof samples)[number]) {
  return parsers.parse({ uri: sample.uri, content: sample.content }, { allowedRoot: '/workspace' })
}

const sampleCatalog: readonly SkillCatalogGroup[] = [{
  id: 'samples',
  label: 'Samples',
  kind: 'workspace',
  skills: samples.map((sample) => {
    const graph = parseSample(sample).graph
    return {
      uri: sample.uri,
      name: graph.name,
      description: graph.description,
      path: sample.uri,
    }
  }),
}]

function PreviewApp() {
  const [sample, setSample] = useState<(typeof samples)[number]>(samples[0])
  const [parsedFindings, setParsedFindings] = useState(() => parseSample(samples[0]).findings)
  const [graph, setGraph] = useState(() => parseSample(samples[0]).graph)
  const [cursor, setCursor] = useState<SourceCursor>({ uri: sample.uri, offset: 0 })
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const deferredGraph = useDeferredValue(graph)
  const findings = [...parsedFindings, ...rules.run(deferredGraph)]

  const selectSample = (sampleId: string): void => {
    const nextSample = samples.find((candidate) => candidate.id === sampleId)
    if (nextSample === undefined) return
    const next = parseSample(nextSample)
    setSample(nextSample)
    setParsedFindings(next.findings)
    setGraph(next.graph)
    setCursor({ uri: nextSample.uri, offset: 0 })
  }

  const revealSource = (source: SourceSpan): void => {
    setCursor({ uri: source.uri, offset: source.start.offset })
    const editor = sourceRef.current
    if (editor === null) return
    editor.focus()
    editor.setSelectionRange(source.start.offset, source.end.offset, 'backward')
  }

  return (
    <main className="vss-preview">
      <SkillEditor
        graph={graph}
        findings={findings}
        sourceCursor={cursor}
        toolbarSearch={(
          <SkillSearch
            groups={sampleCatalog}
            onSelect={(uri) => {
              const nextSample = samples.find((candidate) => candidate.uri === uri)
              if (nextSample !== undefined) selectSample(nextSample.id)
            }}
          />
        )}
        onGraphChange={setGraph}
        onRevealSource={revealSource}
      />
      <section className="vss-source-preview" aria-label="Skill source">
        <header>
          <div><strong>{sample.uri.split('/').at(-1)}</strong><span>{sample.label}</span></div>
          <label>Sample<select value={sample.id} onChange={(event) => selectSample(event.target.value)}>{samples.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}</select></label>
          <output>{findings.length} findings</output>
        </header>
        <textarea
          ref={sourceRef}
          aria-label="Skill source code"
          value={sample.content}
          readOnly
          spellCheck={false}
          onClick={(event) => setCursor({ uri: sample.uri, offset: event.currentTarget.selectionStart })}
          onKeyUp={(event) => setCursor({ uri: sample.uri, offset: event.currentTarget.selectionStart })}
        />
        <footer>Line {sample.content.slice(0, cursor.offset).split('\n').length}</footer>
      </section>
    </main>
  )
}

const root = document.getElementById('root')
if (root === null) throw new Error('Missing application root')
createRoot(root).render(<StrictMode><PreviewApp /></StrictMode>)