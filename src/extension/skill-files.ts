const SKILL_FILE = /(?:^|\/)(?:SKILL|copilot-instructions)\.md$|\.(?:instructions|prompt|agent)\.md$/i

export function isSkillPath(path: string): boolean {
  return SKILL_FILE.test(path.replace(/\\/g, '/'))
}