import type { Position, SourceSpan } from '../../ir/index.js'

/** Character offset of the start of each 1-based line. */
export function lineStarts(content: string): number[] {
  const starts = [0]
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') starts.push(index + 1)
  }
  return starts
}

export function positionAt(starts: readonly number[], line: number, column: number): Position {
  const start = starts[line - 1] ?? 0
  return { line, column, offset: start + column - 1 }
}

export function spanOfLine(
  uri: string,
  starts: readonly number[],
  line: number,
  length: number,
): SourceSpan {
  return {
    uri,
    start: positionAt(starts, line, 1),
    end: positionAt(starts, line, Math.max(length, 0) + 1),
  }
}

export function documentSpan(uri: string, content: string): SourceSpan {
  const starts = lineStarts(content)
  const lastLine = starts.length
  const lastColumn = content.length - (starts[lastLine - 1] ?? 0) + 1
  return {
    uri,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: lastLine, column: lastColumn, offset: content.length },
  }
}

export interface UnistPoint {
  readonly line: number
  readonly column: number
  readonly offset?: number | undefined
}

export interface UnistPosition {
  readonly start: UnistPoint
  readonly end: UnistPoint
}

/** Shifts an mdast position from body-relative coordinates back to whole-file coordinates. */
export function shiftSpan(
  uri: string,
  position: UnistPosition | undefined,
  lineOffset: number,
  charOffset: number,
  fallback: SourceSpan,
): SourceSpan {
  if (position === undefined) return fallback
  return {
    uri,
    start: {
      line: position.start.line + lineOffset,
      column: position.start.column,
      offset: (position.start.offset ?? 0) + charOffset,
    },
    end: {
      line: position.end.line + lineOffset,
      column: position.end.column,
      offset: (position.end.offset ?? 0) + charOffset,
    },
  }
}
