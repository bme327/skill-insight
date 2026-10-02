import type { ReactNode } from 'react'
import type { Nodes, Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export interface MarkdownPreviewProps {
  readonly markdown: string
}

function childrenOf(children: readonly Nodes[], key: string): ReactNode[] {
  return children.map((child, index) => renderNode(child, `${key}-${index}`))
}

function safeHref(value: string): string | undefined {
  const href = value.trim()
  return /^(?:https?:|mailto:|#)/i.test(href) ? href : undefined
}

function renderTable(node: Extract<Nodes, { type: 'table' }>, key: string): ReactNode {
  const [header, ...body] = node.children
  return (
    <table key={key}>
      {header !== undefined && (
        <thead>
          <tr>{header.children.map((cell, index) => <th key={`${key}-head-${index}`}>{childrenOf(cell.children, `${key}-head-${index}`)}</th>)}</tr>
        </thead>
      )}
      {body.length > 0 && (
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`}>
              {row.children.map((cell, cellIndex) => <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>{childrenOf(cell.children, `${key}-cell-${rowIndex}-${cellIndex}`)}</td>)}
            </tr>
          ))}
        </tbody>
      )}
    </table>
  )
}

function renderNode(node: Nodes, key: string): ReactNode {
  switch (node.type) {
    case 'root':
      return childrenOf(node.children, key)
    case 'blockquote':
      return <blockquote key={key}>{childrenOf(node.children, key)}</blockquote>
    case 'break':
      return <br key={key} />
    case 'code':
      return <pre key={key}><code>{node.value}</code></pre>
    case 'delete':
      return <del key={key}>{childrenOf(node.children, key)}</del>
    case 'emphasis':
      return <em key={key}>{childrenOf(node.children, key)}</em>
    case 'heading': {
      const content = childrenOf(node.children, key)
      if (node.depth === 1) return <h1 key={key}>{content}</h1>
      if (node.depth === 2) return <h2 key={key}>{content}</h2>
      if (node.depth === 3) return <h3 key={key}>{content}</h3>
      if (node.depth === 4) return <h4 key={key}>{content}</h4>
      if (node.depth === 5) return <h5 key={key}>{content}</h5>
      return <h6 key={key}>{content}</h6>
    }
    case 'html':
      return null
    case 'image':
      return <span key={key}>{node.alt ?? ''}</span>
    case 'imageReference':
      return <span key={key}>{node.alt ?? ''}</span>
    case 'inlineCode':
      return <code key={key}>{node.value}</code>
    case 'link': {
      const content = childrenOf(node.children, key)
      const href = safeHref(node.url)
      return href === undefined
        ? <span key={key}>{content}</span>
        : <a key={key} href={href} title={node.title ?? undefined} rel="noreferrer">{content}</a>
    }
    case 'linkReference':
      return <span key={key}>{childrenOf(node.children, key)}</span>
    case 'list': {
      const content = childrenOf(node.children, key)
      return node.ordered
        ? <ol key={key} start={node.start ?? undefined}>{content}</ol>
        : <ul key={key}>{content}</ul>
    }
    case 'listItem':
      return (
        <li key={key} className={node.checked === null || node.checked === undefined ? undefined : 'vss-markdown-task'}>
          {node.checked !== null && node.checked !== undefined && <input type="checkbox" checked={node.checked} disabled />}
          {childrenOf(node.children, key)}
        </li>
      )
    case 'paragraph':
      return <p key={key}>{childrenOf(node.children, key)}</p>
    case 'strong':
      return <strong key={key}>{childrenOf(node.children, key)}</strong>
    case 'table':
      return renderTable(node, key)
    case 'text':
      return node.value
    case 'thematicBreak':
      return <hr key={key} />
    default:
      return null
  }
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const root: Root = unified().use(remarkParse).use(remarkGfm).parse(markdown)
  return <div className="vss-markdown-content">{renderNode(root, 'markdown')}</div>
}