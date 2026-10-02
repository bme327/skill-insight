import { expect, test } from '@playwright/test'
import {
  blocks,
  editorRegion,
  graphNames,
  openSample,
  sampleLabels,
  selectSample,
  sourceCursorLine,
  sourceFindingCount,
  sourceRegion,
  wideViewport,
} from './helpers.js'

test.use({ viewport: wideViewport })

test.describe('sample switching', () => {
  test('opens the complex release review sample by default', async ({ page }) => {
    await page.goto('/')

    await expect(editorRegion(page, graphNames.complex)).toBeVisible()
    await expect(page.getByLabel('Sample')).toHaveValue('complex')
    await expect(page.getByLabel('Skill source code')).toHaveValue(/name: complex-release-review/)
  })

  test('offers every bundled sample', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByLabel('Sample').getByRole('option')).toHaveText([
      sampleLabels.complex,
      sampleLabels.previewBuild,
      sampleLabels.injection,
      sampleLabels.traversal,
    ])
  })

  test('swaps the graph and the source when a different sample is chosen', async ({ page }) => {
    await page.goto('/')
    await expect(editorRegion(page, graphNames.complex)).toBeVisible()

    await selectSample(page, sampleLabels.injection)

    await expect(editorRegion(page, graphNames.injection)).toBeVisible()
    await expect(editorRegion(page, graphNames.complex)).toHaveCount(0)
    await expect(page.getByLabel('Skill source code')).toHaveValue(/Ignore all previous instructions/)
    await expect(sourceRegion(page).getByText('injection.md')).toBeVisible()
  })

  test('re-parses each sample into its own block set', async ({ page }) => {
    await openSample(page, 'previewBuild')
    await expect(blocks(page)).toHaveCount(10)

    await selectSample(page, sampleLabels.injection)
    await expect(editorRegion(page, graphNames.injection)).toBeVisible()
    await expect(blocks(page)).toHaveCount(2)

    await selectSample(page, sampleLabels.traversal)
    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()
    await expect(blocks(page)).toHaveCount(5)
    await expect(page.getByLabel('Skill source code')).toHaveValue(/etc\/passwd/)
  })

  test('re-runs validation so the finding tally follows the sample', async ({ page }) => {
    await openSample(page, 'previewBuild')
    await expect(sourceFindingCount(page)).toHaveText('0 findings')

    await selectSample(page, sampleLabels.traversal)

    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()
    await expect(sourceFindingCount(page)).not.toHaveText('0 findings')
    await expect(sourceFindingCount(page)).toHaveText(/^\d+ findings$/)
  })

  test('resets the source cursor back to the top of the new sample', async ({ page }) => {
    await openSample(page, 'traversal')

    await page.getByRole('button', { name: 'Go to source for collect-config' }).click()
    await expect(sourceCursorLine(page)).not.toHaveText('Line 1')

    await selectSample(page, sampleLabels.injection)

    await expect(editorRegion(page, graphNames.injection)).toBeVisible()
    await expect(sourceCursorLine(page)).toHaveText('Line 1')
  })
})
