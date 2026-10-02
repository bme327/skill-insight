import { z } from 'zod'
import { findingSchema, skillGraphSchema, sourceSpanSchema } from '../ir/index.js'
import { skillCatalogGroupSchema } from './catalog.js'

export const assessmentStateSchema = z.enum(['unavailable', 'ready', 'running', 'error'])

export const assessmentStatusSchema = z.object({
  state: assessmentStateSchema,
  modelLabel: z.string().optional(),
  message: z.string().optional(),
  summary: z.string().optional(),
  lastRunAt: z.string().optional(),
})

export const hostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('analysis'),
    graph: skillGraphSchema,
    findings: z.array(findingSchema),
  }),
  z.object({
    type: z.literal('empty'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('catalog'),
    groups: z.array(skillCatalogGroupSchema),
    selectedUri: z.string().optional(),
  }),
  z.object({
    type: z.literal('status'),
    scanning: z.boolean(),
    scanned: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('filter'),
    value: z.string().max(200),
  }),
  assessmentStatusSchema.extend({ type: z.literal('assessment') }),
])

export const webviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({
    type: z.literal('revealSource'),
    source: sourceSpanSchema,
  }),
  z.object({
    type: z.literal('selectSkill'),
    uri: z.string().min(1),
  }),
  z.object({
    type: z.literal('setFilter'),
    value: z.string().max(200),
  }),
  z.object({
    type: z.literal('runAssessment'),
    force: z.boolean().optional(),
  }),
])

export type AssessmentState = z.infer<typeof assessmentStateSchema>
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>
export type HostMessage = z.infer<typeof hostMessageSchema>
export type WebviewMessage = z.infer<typeof webviewMessageSchema>