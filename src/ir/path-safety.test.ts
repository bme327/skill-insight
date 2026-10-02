import { describe, expect, it } from 'vitest'
import { resolveWithinRoot } from './path-safety.js'

describe('resolveWithinRoot', () => {
  it('resolves a plain relative reference under the root', () => {
    expect(resolveWithinRoot('workspace/skills', 'docs/guide.md')).toEqual({
      ok: true,
      path: 'workspace/skills/docs/guide.md',
    })
  })

  it('resolves a reference that stays inside the root after backtracking', () => {
    expect(resolveWithinRoot('workspace/skills', 'nested/../guide.md')).toEqual({
      ok: true,
      path: 'workspace/skills/guide.md',
    })
  })

  it('normalises Windows separators', () => {
    expect(resolveWithinRoot('workspace', 'docs\\guide.md')).toEqual({
      ok: true,
      path: 'workspace/docs/guide.md',
    })
  })

  it.each([
    ['../secrets.env', 'escapes-root'],
    ['../../etc/passwd', 'escapes-root'],
    ['docs/../../outside.md', 'escapes-root'],
    ['/etc/passwd', 'absolute'],
    ['C:/Windows/system32', 'absolute'],
    ['\\\\server\\share', 'absolute'],
    ['//evil.example/payload', 'absolute'],
    ['file:///etc/passwd', 'uri-scheme'],
    ['https://example.invalid/x', 'uri-scheme'],
    ['vscode://settings', 'uri-scheme'],
    ['   ', 'empty'],
    ['docs/\u0000guide.md', 'control-character'],
  ])('rejects %s', (reference, reason) => {
    expect(resolveWithinRoot('workspace', reference)).toEqual({ ok: false, reason })
  })

  it('rejects a reference that only names the root itself', () => {
    expect(resolveWithinRoot('workspace', './')).toEqual({ ok: false, reason: 'empty' })
  })

  it('does not let a sibling directory with a shared prefix pass as inside the root', () => {
    expect(resolveWithinRoot('workspace/skills', '../skills-backup/secret.md')).toEqual({
      ok: false,
      reason: 'escapes-root',
    })
  })
})
