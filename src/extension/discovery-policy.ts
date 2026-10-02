export const INCLUDE_PERSONAL_SKILLS_SETTING = 'skillInsights.includePersonalSkills'

export function includesPersonalSkills(value: unknown): boolean {
  return value !== false
}
