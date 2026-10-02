import type { SkillGraph } from '../ir/index.js'

export interface EditorHistory {
  readonly past: readonly SkillGraph[]
  readonly present: SkillGraph
  readonly future: readonly SkillGraph[]
}

export function createEditorHistory(graph: SkillGraph): EditorHistory {
  return { past: [], present: graph, future: [] }
}

export function updateHistory(history: EditorHistory, graph: SkillGraph, limit = 100): EditorHistory {
  if (graph === history.present) return history
  return {
    past: [...history.past, history.present].slice(-limit),
    present: graph,
    future: [],
  }
}

export function undo(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1)
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo(history: EditorHistory): EditorHistory {
  const next = history.future[0]
  if (next === undefined) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}