import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SkillFile } from '../parsers/index.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Line endings are normalised so committed source spans do not shift between
 * a CRLF checkout and an LF one.
 */
export function loadFixture(relativePath: string): SkillFile {
  const content = readFileSync(`${ROOT}fixtures/${relativePath}`, 'utf8').replace(/\r\n/g, '\n')
  return { uri: `fixtures/${relativePath}`, content }
}

export const ALLOWED_ROOT = 'fixtures'
