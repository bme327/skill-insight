import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview.js'

describe('MarkdownPreview', () => {
  it('renders basic Markdown formatting', () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview markdown={'## Steps\n\nUse **npm**.\n\n- Run `npm test`\n\n[Docs](https://example.com)'} />,
    )

    expect(markup).toContain('<h2>Steps</h2>')
    expect(markup).toContain('<strong>npm</strong>')
    expect(markup).toContain('<ul>')
    expect(markup).toContain('<code>npm test</code>')
    expect(markup).toContain('href="https://example.com"')
  })

  it('does not render raw HTML or unsafe links', () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview markdown={'<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))'} />,
    )

    expect(markup).not.toContain('<script>')
    expect(markup).not.toContain('href="javascript:')
    expect(markup).toContain('Unsafe')
  })

  it('renders GFM tables, task lists, strikethrough, and autolinks', () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview markdown={'| Check | Result |\n| --- | --- |\n| Build | Pass |\n\n- [x] Compile\n- [ ] Publish\n\n~~obsolete~~ https://example.com/status'} />,
    )

    expect(markup).toContain('<table>')
    expect(markup).toContain('<thead>')
    expect(markup).toContain('<th>Check</th>')
    expect(markup).toContain('<td>Pass</td>')
    expect(markup).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*checked="")(?=[^>]*disabled="")[^>]*>/)
    expect(markup).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*disabled="")(?![^>]*checked="")[^>]*>/)
    expect(markup).toContain('<del>obsolete</del>')
    expect(markup).toContain('href="https://example.com/status"')
  })
})