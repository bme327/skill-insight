import { describe, expect, it } from 'vitest'
import { stableId } from './ids.js'

describe('stableId', () => {
  it('is deterministic for the same inputs', () => {
    expect(stableId('action', 'skill.md', 42, 'Build')).toBe(stableId('action', 'skill.md', 42, 'Build'))
  })

  it('changes when any part changes', () => {
    const base = stableId('action', 'skill.md', 42, 'Build')
    expect(stableId('action', 'skill.md', 43, 'Build')).not.toBe(base)
    expect(stableId('action', 'other.md', 42, 'Build')).not.toBe(base)
    expect(stableId('toolCall', 'skill.md', 42, 'Build')).not.toBe(base)
  })

  it('does not collide when parts are rearranged across the boundary', () => {
    expect(stableId('action', 'ab', 'c')).not.toBe(stableId('action', 'a', 'bc'))
  })

  it('keeps the prefix readable', () => {
    expect(stableId('trigger', 'skill.md')).toMatch(/^trigger_[0-9a-f]{8}$/)
  })
})
