import { expect, test } from '@playwright/test'
import { block, inspector, markdownPreviewDialog, openSample, wideViewport } from './helpers.js'

test.use({ viewport: wideViewport })

// Added with the rich Markdown preview (PR #2), which landed without e2e coverage.
// Viewing a block's detail as rendered Markdown is a read-only journey, so it belongs here.
test.describe('markdown preview', () => {
  const reportBlock = '## Release review summary The candidate is **ready for revi…, attached errorPath'

  test('opens a labelled preview dialog for the selected block', async ({ page }) => {
    await openSample(page, 'previewBuild')
    await block(page, '/preview-build').click()
    await expect(markdownPreviewDialog(page)).toHaveCount(0)

    await inspector(page).getByRole('button', { name: 'MD preview' }).click()

    await expect(markdownPreviewDialog(page)).toBeVisible()
    await expect(markdownPreviewDialog(page)).toContainText('Markdown preview')
    await expect(markdownPreviewDialog(page).getByRole('heading', { name: '/preview-build' })).toBeVisible()
  })

  test('closes again from the dialog', async ({ page }) => {
    await openSample(page, 'previewBuild')
    await block(page, '/preview-build').click()
    await inspector(page).getByRole('button', { name: 'MD preview' }).click()
    await expect(markdownPreviewDialog(page)).toBeVisible()

    await page.getByRole('button', { name: 'Close Markdown preview' }).click()

    await expect(markdownPreviewDialog(page)).toBeHidden()
  })

  test('renders the detail as Markdown rather than as escaped text', async ({ page }) => {
    await openSample(page, 'complex')
    await block(page, reportBlock).click()

    await inspector(page).getByRole('button', { name: 'MD preview' }).click()

    const dialog = markdownPreviewDialog(page)
    await expect(dialog.getByRole('heading', { name: 'Release review summary', exact: true })).toBeVisible()
    await expect(dialog.getByText('ready for review')).toBeVisible()
    await expect(dialog.getByRole('listitem')).not.toHaveCount(0)
  })

  test('hardens rendered external links', async ({ page }) => {
    await openSample(page, 'complex')
    await block(page, reportBlock).click()

    await inspector(page).getByRole('button', { name: 'MD preview' }).click()

    const link = markdownPreviewDialog(page).getByRole('link', { name: 'release evidence' })
    await expect(link).toHaveAttribute('rel', /noreferrer/)
    await expect(link).toHaveAttribute('href', 'https://example.com/releases/evidence')
  })
})
