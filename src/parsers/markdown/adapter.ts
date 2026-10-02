import type { Code, List, Paragraph, Root, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { Capability, Finding, SkillEdge, SkillGraph, SkillNode, SourceSpan } from '../../ir/index.js'
import { SCHEMA_VERSION, emptyGraph, stableId } from '../../ir/index.js'
import type { ParseOptions, ParseResult, ParserAdapter, SkillFile } from '../types.js'
import { classifyStatement, isFallible, titleOf } from './classify.js'
import type { StatementKind } from './classify.js'
import {
  dedupeCapabilities,
  inlineCodeCapability,
  isPathLike,
  networkCapabilities,
  resolveReference,
  toolMentionsIn,
} from './extract.js'
import type { ReferenceRecord } from './extract.js'
import {
  frontmatterKeySpan,
  parseFrontmatter,
  readString,
  readStringList,
  splitFrontmatter,
} from './frontmatter.js'
import { documentSpan, shiftSpan } from './source.js'

const FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'allowed-tools',
  'allowedTools',
  'tools',
  'argument-hint',
  'argumentHint',
])

const INPUT_PLACEHOLDER = /\$\{input:([A-Za-z][\w-]*)\}|\$([A-Z][A-Z_]{2,})/g
const ELSE_BRANCH = /^\s*(?:otherwise|if not|else)\b/i
const MARKDOWN_FILE = /\.(?:md|markdown)$/i

interface Statement {
  readonly text: string
  readonly span: SourceSpan
  readonly node: RootContent
}

function stemOf(uri: string): string {
  const tail = uri.split(/[/\\]/).pop() ?? uri
  return tail.replace(/\.[^.]+$/, '')
}

function collectStatements(
  root: Root,
  uri: string,
  lineOffset: number,
  charOffset: number,
  fallback: SourceSpan,
): Statement[] {
  const statements: Statement[] = []
  root.children.forEach((child, index) => {
    if (child.type === 'list') {
      for (const item of (child as List).children) {
        // Anchor on the inner paragraph so the span excludes the list marker.
        const first = item.children[0]
        const target = item.children.length === 1 && first?.type === 'paragraph' ? first : item
        statements.push({
          text: toString(target),
          span: shiftSpan(uri, target.position, lineOffset, charOffset, fallback),
          node: target as unknown as RootContent,
        })
      }
      return
    }
    if (child.type === 'paragraph') {
      // A paragraph ending in a colon introduces the list that follows; it is not a step.
      const text = toString(child as Paragraph)
      if (text.trimEnd().endsWith(':') && root.children[index + 1]?.type === 'list') return
      statements.push({
        text,
        span: shiftSpan(uri, child.position, lineOffset, charOffset, fallback),
        node: child,
      })
      return
    }
    if (child.type === 'code') {
      statements.push({
        text: (child as Code).value,
        span: shiftSpan(uri, child.position, lineOffset, charOffset, fallback),
        node: child,
      })
    }
  })
  return statements.filter((statement) => statement.text.trim().length > 0)
}

interface InlineHarvest {
  readonly capabilities: Capability[]
  readonly references: ReferenceRecord[]
}

function harvestInline(
  statement: Statement,
  uri: string,
  lineOffset: number,
  charOffset: number,
  declaredTools: readonly string[],
  allowedRoot: string,
): InlineHarvest {
  const capabilities: Capability[] = []
  const references: ReferenceRecord[] = []

  if (statement.node.type === 'code') {
    const value = statement.text.trim().split('\n')[0]?.trim() ?? ''
    const capability = inlineCodeCapability(value, declaredTools)
    if (capability !== undefined) capabilities.push(capability)
    else if (value.length > 0) capabilities.push({ kind: 'process', value, declared: false })
  }

  visit(statement.node as unknown as Root, (node) => {
    const span = shiftSpan(uri, node.position, lineOffset, charOffset, statement.span)
    if (node.type === 'inlineCode') {
      const value = String((node as { value: string }).value)
      if (isPathLike(value)) {
        references.push(resolveReference(value, allowedRoot, span))
        capabilities.push({ kind: 'file', value, declared: false })
        return
      }
      const capability = inlineCodeCapability(value, declaredTools)
      if (capability !== undefined) capabilities.push(capability)
      return
    }
    if (node.type === 'link') {
      const url = String((node as { url: string }).url)
      if (/^https?:\/\//i.test(url)) {
        capabilities.push({ kind: 'network', value: url, declared: false })
        return
      }
      if (url.startsWith('#')) return
      references.push(resolveReference(url, allowedRoot, span))
      capabilities.push({ kind: 'file', value: url, declared: false })
    }
  })

  for (const tool of toolMentionsIn(statement.text, declaredTools)) {
    capabilities.push({ kind: 'tool', value: tool, declared: declaredTools.includes(tool) })
  }
  capabilities.push(...networkCapabilities(statement.text))

  return { capabilities: dedupeCapabilities(capabilities), references }
}

export function createMarkdownSkillAdapter(): ParserAdapter {
  return {
    id: 'markdown-skill',
    provider: 'markdown',

    detect(file: SkillFile): boolean {
      return MARKDOWN_FILE.test(file.uri)
    },

    recognize(file: SkillFile): boolean {
      if (!MARKDOWN_FILE.test(file.uri)) return false
      const block = splitFrontmatter(file.content)
      const frontmatter = parseFrontmatter(block)
      return block.present && frontmatter.error === undefined && Object.keys(frontmatter.data).length > 0
    },

    parse(file: SkillFile, options: ParseOptions): ParseResult {
      const findings: Finding[] = []
      const fallback = documentSpan(file.uri, file.content)

      if (file.content.trim().length === 0) {
        findings.push({
          ruleId: 'parse/empty-document',
          severity: 'warning',
          message: 'The skill file is empty.',
          nodeIds: [],
          source: fallback,
        })
        return {
          graph: emptyGraph({
            id: stableId('skill', file.uri),
            name: stemOf(file.uri),
            provider: 'markdown',
            sourceUri: file.uri,
          }),
          findings,
        }
      }

      const block = splitFrontmatter(file.content)
      const frontmatter = parseFrontmatter(block)
      if (!block.present) {
        findings.push({
          ruleId: 'parse/frontmatter-missing',
          severity: 'info',
          message: 'No frontmatter found; the skill name was taken from the file name.',
          nodeIds: [],
          source: fallback,
        })
      }
      if (frontmatter.error !== undefined) {
        findings.push({
          ruleId: 'parse/frontmatter-invalid',
          severity: 'error',
          message: `Frontmatter could not be parsed: ${frontmatter.error}`,
          nodeIds: [],
          source: fallback,
        })
      }

      const name = readString(frontmatter.data, 'name') || stemOf(file.uri)
      const description = readString(frontmatter.data, 'description')
      const declaredTools = readStringList(frontmatter.data, 'allowed-tools', 'allowedTools', 'tools')
      const argumentHint = readString(frontmatter.data, 'argument-hint', 'argumentHint')
      const raw = Object.fromEntries(
        Object.entries(frontmatter.data).filter(([key]) => !FRONTMATTER_KEYS.has(key)),
      )

      const body = file.content.slice(block.bodyOffset)
      const root = unified().use(remarkParse).parse(body) as Root
      const lineOffset = block.bodyLine - 1
      const statements = collectStatements(root, file.uri, lineOffset, block.bodyOffset, fallback)

      const nodes: SkillNode[] = []
      const edges: SkillEdge[] = []
      const connect = (from: string, to: string, kind: SkillEdge['kind'], label = ''): void => {
        edges.push({ id: stableId('edge', from, to, kind), from, to, kind, label })
      }
      const push = (node: SkillNode): string => {
        nodes.push(node)
        return node.id
      }

      const triggerSpan = frontmatterKeySpan(file.uri, file.content, block, 'name') ?? fallback
      const triggerId = push({
        id: stableId('trigger', file.uri, triggerSpan.start.offset, name),
        kind: 'trigger',
        title: body.includes(`/${name}`) ? `/${name}` : name,
        detail: description,
        source: triggerSpan,
        capabilities: [],
        inferred: false,
        confidence: 1,
        raw: {},
      })

      if (argumentHint.length > 0) {
        const span = frontmatterKeySpan(file.uri, file.content, block, 'argument-hint') ?? triggerSpan
        const inputId = push({
          id: stableId('input', file.uri, span.start.offset, argumentHint),
          kind: 'input',
          title: 'Argument',
          detail: argumentHint,
          source: span,
          capabilities: [],
          inferred: false,
          confidence: 1,
          raw: {},
        })
        connect(triggerId, inputId, 'dataFlow', 'argument')
      }

      const seenPlaceholders = new Set<string>()
      for (const statement of statements) {
        for (const match of statement.text.matchAll(INPUT_PLACEHOLDER)) {
          const placeholder = match[1] ?? match[2]
          if (placeholder === undefined || seenPlaceholders.has(placeholder)) continue
          seenPlaceholders.add(placeholder)
          const inputId = push({
            id: stableId('input', file.uri, statement.span.start.offset, placeholder),
            kind: 'input',
            title: placeholder,
            detail: statement.text.trim(),
            source: statement.span,
            capabilities: [],
            inferred: false,
            confidence: 1,
            raw: {},
          })
          connect(triggerId, inputId, 'dataFlow', 'input')
        }
      }

      let chainTail = triggerId
      if (declaredTools.length > 0) {
        const span = frontmatterKeySpan(file.uri, file.content, block, 'allowed-tools') ?? triggerSpan
        const permissionId = push({
          id: stableId('permission', file.uri, span.start.offset, declaredTools.join(',')),
          kind: 'permission',
          title: 'Declared tools',
          detail: declaredTools.join(', '),
          source: span,
          capabilities: declaredTools.map((tool) => ({ kind: 'tool' as const, value: tool, declared: true })),
          inferred: false,
          confidence: 1,
          raw: {},
        })
        connect(chainTail, permissionId, 'then')
        chainTail = permissionId
      }

      let lastCondition: string | undefined
      let lastFallible: string | undefined

      for (const statement of statements) {
        const harvest = harvestInline(
          statement,
          file.uri,
          lineOffset,
          block.bodyOffset,
          declaredTools,
          options.allowedRoot,
        )
        const toolMentions = harvest.capabilities
          .filter((capability) => capability.kind === 'tool')
          .map((capability) => capability.value)
        const kind: StatementKind = classifyStatement(statement.text, toolMentions)
        const title = titleOf(statement.text)

        const nodeId = push({
          id: stableId(kind, file.uri, statement.span.start.offset, title),
          kind,
          title,
          detail: statement.node.type === 'code'
            ? statement.text.trim()
            : statement.text.replace(/\s+/g, ' ').trim(),
          source: statement.span,
          capabilities: harvest.capabilities,
          inferred: true,
          confidence: kind === 'action' ? 0.5 : 0.7,
          raw: {},
        })

        for (const reference of harvest.references) {
          const referenceId = push({
            id: stableId('reference', file.uri, reference.span.start.offset, reference.value),
            kind: 'reference',
            title: reference.value,
            detail: reference.resolved ?? `unresolved (${reference.rejection ?? 'unknown'})`,
            source: reference.span,
            capabilities: [{ kind: 'file', value: reference.value, declared: false }],
            inferred: false,
            confidence: 1,
            raw: { resolved: reference.resolved, rejection: reference.rejection },
          })
          connect(nodeId, referenceId, 'dataFlow', 'reference')
        }

        if (kind === 'errorPath') {
          connect(lastFallible ?? chainTail, nodeId, 'onError')
          continue
        }
        if (lastCondition !== undefined && ELSE_BRANCH.test(statement.text)) {
          connect(lastCondition, nodeId, 'else')
          continue
        }

        connect(chainTail, nodeId, 'then', lastCondition === chainTail ? 'yes' : '')
        chainTail = nodeId
        if (kind === 'condition') lastCondition = nodeId
        if (isFallible(kind)) lastFallible = nodeId
      }

      const graph: SkillGraph = {
        schemaVersion: SCHEMA_VERSION,
        id: stableId('skill', file.uri),
        name,
        description,
        provider: 'markdown',
        sourceUri: file.uri,
        declaredTools,
        nodes,
        edges,
        raw,
      }

      return { graph, findings }
    },
  }
}
