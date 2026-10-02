export type PathRejection =
  | 'empty'
  | 'control-character'
  | 'uri-scheme'
  | 'absolute'
  | 'escapes-root'

export type PathResolution =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: PathRejection }

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
// Control characters are the payload we are screening for, so matching them is the point.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/')
}

function isAbsolute(value: string): boolean {
  return value.startsWith('/') || /^[a-z]:\//i.test(value) || value.startsWith('//')
}

/**
 * Resolves a reference found inside untrusted skill text against an allowed root.
 * Anything that leaves the root, names a scheme, or is absolute is rejected rather
 * than clamped - a caller must never receive a path it did not ask for.
 */
export function resolveWithinRoot(root: string, reference: string): PathResolution {
  const trimmed = reference.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (CONTROL.test(trimmed)) return { ok: false, reason: 'control-character' }

  const candidate = normalizeSeparators(trimmed)
  if (candidate.startsWith('//')) return { ok: false, reason: 'absolute' }
  if (SCHEME.test(candidate) && !/^[a-z]:\//i.test(candidate)) return { ok: false, reason: 'uri-scheme' }
  if (isAbsolute(candidate)) return { ok: false, reason: 'absolute' }

  const rootSegments = normalizeSeparators(root).split('/').filter((part) => part.length > 0 && part !== '.')
  const resolved = [...rootSegments]
  for (const segment of candidate.split('/')) {
    if (segment.length === 0 || segment === '.') continue
    if (segment === '..') {
      if (resolved.length <= rootSegments.length) return { ok: false, reason: 'escapes-root' }
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }

  if (resolved.length === rootSegments.length) return { ok: false, reason: 'empty' }
  return { ok: true, path: resolved.join('/') }
}
