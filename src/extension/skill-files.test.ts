import { describe, expect, it } from 'vitest'
import { isSkillPath } from './skill-files.js'

describe('isSkillPath', () => {
  it.each([
    '/workspace/SKILL.md',
    '/workspace/.claude/skills/swarm/SKILL.md',
    '/workspace/copilot-instructions.md',
    '/workspace/review.instructions.md',
    'C:\\workspace\\release.prompt.md',
    '/workspace/security.agent.md',
  ])('recognises %s', (path) => expect(isSkillPath(path)).toBe(true))

  it.each(['/workspace/README.md', '/workspace/SKILL.txt', '/workspace/instructions.md']) (
    'ignores %s',
    (path) => expect(isSkillPath(path)).toBe(false),
  )
})