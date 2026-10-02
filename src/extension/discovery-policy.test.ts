import { describe, expect, it } from 'vitest'
import { includesPersonalSkills } from './discovery-policy.js'

describe('includesPersonalSkills', () => {
  it('preserves personal discovery by default', () => {
    expect(includesPersonalSkills(undefined)).toBe(true)
    expect(includesPersonalSkills(true)).toBe(true)
  })

  it('supports workspace-only discovery', () => {
    expect(includesPersonalSkills(false)).toBe(false)
  })
})
