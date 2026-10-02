import { describe, expect, it } from 'vitest'
import { classifyStatement, isFallible, titleOf } from './classify.js'

describe('classifyStatement', () => {
  it.each([
    ['If the build fails, report the diagnostics.', 'errorPath'],
    ['On failure, restore the previous version.', 'errorPath'],
    ['If the target is provided, use it.', 'condition'],
    ['When the user asks for a summary, gather the files.', 'condition'],
    ['Wait for the readiness signal.', 'validation'],
    ['Verify that the port is listening.', 'validation'],
    ['Return the drafted notes.', 'output'],
    ['Build the shared packages.', 'action'],
  ])('classifies %s as %s', (text, expected) => {
    expect(classifyStatement(text, [])).toBe(expected)
  })

  it('prefers a tool call when a tool is mentioned', () => {
    expect(classifyStatement('Start the hub.', ['create_and_run_task'])).toBe('toolCall')
  })

  // A failing condition is a failure branch, not a routing decision.
  it('prefers the error path over the condition for a failure clause', () => {
    expect(classifyStatement('If the request cannot complete, stop.', [])).toBe('errorPath')
  })

  it('does not treat an incidental "if" in the middle of a sentence as a condition', () => {
    expect(classifyStatement('Build the packages if requested by the user.', [])).toBe('action')
  })

  it('falls back to an action for empty text', () => {
    expect(classifyStatement('   ', [])).toBe('action')
  })
})

describe('isFallible', () => {
  it('covers the kinds that reach outside the process', () => {
    expect(isFallible('action')).toBe(true)
    expect(isFallible('toolCall')).toBe(true)
    expect(isFallible('condition')).toBe(false)
    expect(isFallible('output')).toBe(false)
  })
})

describe('titleOf', () => {
  it('uses the first sentence without its terminator', () => {
    expect(titleOf('Build the packages. Then start the hub.')).toBe('Build the packages')
  })

  it('collapses whitespace', () => {
    expect(titleOf('Build   the\npackages')).toBe('Build the packages')
  })

  it('truncates long text', () => {
    expect(titleOf('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
