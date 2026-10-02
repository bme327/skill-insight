/**
 * FNV-1a. Not a security hash - only used to derive stable, collision-unlikely node ids
 * from content that is already unique (kind + source offset).
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function stableId(prefix: string, ...parts: readonly (string | number)[]): string {
  return `${prefix}_${fnv1a(parts.join('\u0000'))}`
}
