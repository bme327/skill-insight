import { z } from 'zod'

export const skillLocationKindSchema = z.enum(['workspace', 'personal'])

export const skillCatalogEntrySchema = z.object({
  uri: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  path: z.string().min(1),
})

export const skillCatalogGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: skillLocationKindSchema,
  skills: z.array(skillCatalogEntrySchema),
})

export type SkillLocationKind = z.infer<typeof skillLocationKindSchema>
export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>
export type SkillCatalogGroup = z.infer<typeof skillCatalogGroupSchema>

export interface SkillCatalogRecord {
  readonly groupId: string
  readonly groupLabel: string
  readonly kind: SkillLocationKind
  readonly skill: SkillCatalogEntry
}

export function groupCatalog(records: readonly SkillCatalogRecord[]): SkillCatalogGroup[] {
  const groups = new Map<string, SkillCatalogGroup>()
  for (const record of records) {
    const existing = groups.get(record.groupId)
    if (existing === undefined) {
      groups.set(record.groupId, {
        id: record.groupId,
        label: record.groupLabel,
        kind: record.kind,
        skills: [record.skill],
      })
    } else {
      existing.skills.push(record.skill)
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      skills: [...group.skills].sort((left, right) =>
        left.name.localeCompare(right.name) || left.path.localeCompare(right.path)),
    }))
    .sort((left, right) => {
      const byKind = left.kind === right.kind ? 0 : left.kind === 'workspace' ? -1 : 1
      return byKind || left.label.localeCompare(right.label)
    })
}