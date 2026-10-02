import { describe, expect, it } from 'vitest'
import type { SkillGraph } from '../ir/index.js'
import { testGraph, testNode } from '../testing/graph-builder.js'
import { createEditorHistory, redo, undo, updateHistory } from './history.js'

function named(name: string): SkillGraph {
  return { ...testGraph([testNode('action', 'action')]), name }
}

describe('editor history', () => {
  it('treats undo with nothing in the past as a no-op', () => {
    const history = createEditorHistory(named('base'))

    expect(undo(history)).toBe(history)
  })

  it('treats redo with nothing in the future as a no-op', () => {
    const history = updateHistory(createEditorHistory(named('base')), named('edited'))

    expect(redo(history)).toBe(history)
  })

  it('treats re-committing the present graph as a no-op', () => {
    const history = createEditorHistory(named('base'))

    expect(updateHistory(history, history.present)).toBe(history)
  })

  it('clears the redo future when a new edit lands after an undo', () => {
    const base = named('base')
    const edited = updateHistory(createEditorHistory(base), named('edited'))
    const reverted = undo(edited)
    expect(reverted.future).toHaveLength(1)

    const diverged = updateHistory(reverted, named('diverged'))

    expect(diverged.future).toEqual([])
    expect(redo(diverged)).toBe(diverged)
    expect(diverged.present.name).toBe('diverged')
  })

  it('trims the oldest past entries once the limit is exceeded', () => {
    const history = [named('one'), named('two'), named('three'), named('four')].reduce(
      (current, graph) => updateHistory(current, graph, 2),
      createEditorHistory(named('base')),
    )

    expect(history.past).toHaveLength(2)
    expect(history.past.map((graph) => graph.name)).toEqual(['two', 'three'])
    expect(history.present.name).toBe('four')
  })

  it('never mutates the history it is given', () => {
    const base = createEditorHistory(named('base'))
    const committed = updateHistory(base, named('edited'))

    undo(committed)
    redo(undo(committed))
    updateHistory(committed, named('another'))

    expect(base).toEqual({ past: [], present: base.present, future: [] })
    expect(committed.past).toHaveLength(1)
    expect(committed.future).toEqual([])
    expect(committed.present.name).toBe('edited')
  })
})
