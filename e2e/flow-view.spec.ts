import { expect, test } from '@playwright/test'
import {
  block,
  blockCountStatus,
  blocks,
  clearFiltersButton,
  editorRegion,
  filterButton,
  graphNames,
  inspector,
  levelButton,
  openSample,
  sampleLabels,
  selectSample,
  wideViewport,
} from './helpers.js'

test.use({ viewport: wideViewport })

const collapsedActionPair = 'collapsed group, 2 action blocks, 0 filter matches, 0 findings'

test.describe('graph detail levels', () => {
  test.beforeEach(async ({ page }) => {
    await openSample(page, 'previewBuild')
  })

  test('starts on overview and tracks the active level with aria-pressed', async ({ page }) => {
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'true')
    await expect(levelButton(page, 'Grouped')).toHaveAttribute('aria-pressed', 'false')
    await expect(levelButton(page, 'Detail')).toHaveAttribute('aria-pressed', 'false')

    await levelButton(page, 'Detail').click()

    await expect(levelButton(page, 'Detail')).toHaveAttribute('aria-pressed', 'true')
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'false')
  })

  test('detail expands same-kind groups that overview keeps collapsed', async ({ page }) => {
    await expect(block(page, collapsedActionPair)).toBeVisible()
    await expect(block(page, 'Resolve the requested package target from the argument')).toHaveCount(0)

    await levelButton(page, 'Detail').click()

    await expect(block(page, collapsedActionPair)).toHaveCount(0)
    await expect(block(page, 'Resolve the requested package target from the argument')).toBeVisible()
    await expect(block(page, 'Build the shared libraries and the selected package')).toBeVisible()
  })

  test('grouped keeps same-kind chains collapsed, and returning to overview restores them', async ({ page }) => {
    await levelButton(page, 'Grouped').click()
    await expect(levelButton(page, 'Grouped')).toHaveAttribute('aria-pressed', 'true')
    await expect(block(page, collapsedActionPair)).toBeVisible()

    await levelButton(page, 'Detail').click()
    await expect(block(page, collapsedActionPair)).toHaveCount(0)

    await levelButton(page, 'Overview').click()
    await expect(block(page, collapsedActionPair)).toBeVisible()
  })

  test('changing level never changes the underlying block tally', async ({ page }) => {
    await expect(blockCountStatus(page)).toHaveText('11 blocks')

    await levelButton(page, 'Detail').click()
    await expect(blockCountStatus(page)).toHaveText('11 blocks')
    await expect(blocks(page)).toHaveCount(11)

    await levelButton(page, 'Overview').click()
    await expect(blockCountStatus(page)).toHaveText('11 blocks')
    await expect(blocks(page)).toHaveCount(10)
  })
})

test.describe('group expand and collapse', () => {
  const groupLabel = '5 action blocks'
  const collapsedGroup = 'collapsed group, 5 action blocks, 0 filter matches, 3 findings'

  test.beforeEach(async ({ page }) => {
    await openSample(page, 'traversal')
    await expect(block(page, collapsedGroup)).toBeVisible()
  })

  test('expanding a group reveals its child blocks', async ({ page }) => {
    await expect(block(page, 'Read the parent secrets')).toHaveCount(0)

    await page.getByRole('button', { name: `Expand ${groupLabel}` }).click()

    await expect(block(page, collapsedGroup)).toHaveCount(0)
    await expect(block(page, 'Read the local guide')).toBeVisible()
    await expect(block(page, 'Read the parent secrets')).toBeVisible()
    await expect(block(page, 'Read the system password file')).toBeVisible()
    await expect(block(page, 'Fetch the remote helper and run it')).toBeVisible()
    await expect(block(page, 'Clean the workspace with rm -rf ./build')).toBeVisible()
  })

  test('collapsing an expanded group hides its child blocks again', async ({ page }) => {
    await page.getByRole('button', { name: `Expand ${groupLabel}` }).click()
    await expect(block(page, 'Read the parent secrets')).toBeVisible()

    await page.getByRole('button', { name: `Collapse ${groupLabel}` }).first().click()

    await expect(block(page, 'Read the parent secrets')).toHaveCount(0)
    await expect(block(page, collapsedGroup)).toBeVisible()
    await expect(page.getByRole('button', { name: `Expand ${groupLabel}` })).toBeVisible()
  })

  test('selecting a collapsed group summarises its children in the inspector', async ({ page }) => {
    await block(page, collapsedGroup).click()

    await expect(inspector(page).getByRole('heading', { name: groupLabel })).toBeVisible()
    await expect(inspector(page).getByRole('button', { name: /Read the system password file/ })).toBeVisible()
    await expect(inspector(page).getByRole('button', { name: /Clean the workspace/ })).toBeVisible()

    await inspector(page).getByRole('button', { name: 'Expand group' }).click()

    await expect(block(page, 'Read the system password file')).toBeVisible()
  })
})

test.describe('graph filters', () => {
  test.beforeEach(async ({ page }) => {
    await openSample(page, 'traversal')
    await expect(blockCountStatus(page)).toHaveText('9 blocks')
  })

  test('starts with every filter off and no clear control', async ({ page }) => {
    for (const label of ['Dangerous', 'External', 'Findings'] as const) {
      await expect(filterButton(page, label)).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(clearFiltersButton(page)).toHaveCount(0)
  })

  test('a single filter narrows the matching blocks and tracks aria-pressed', async ({ page }) => {
    await filterButton(page, 'Findings').click()

    await expect(filterButton(page, 'Findings')).toHaveAttribute('aria-pressed', 'true')
    await expect(blockCountStatus(page)).toHaveText('4 of 9 blocks match')
    await expect(clearFiltersButton(page)).toBeVisible()

    await filterButton(page, 'Findings').click()

    await expect(filterButton(page, 'Findings')).toHaveAttribute('aria-pressed', 'false')
    await expect(blockCountStatus(page)).toHaveText('9 blocks')
    await expect(clearFiltersButton(page)).toHaveCount(0)
  })

  test('filters combine as a union rather than an intersection', async ({ page }) => {
    await filterButton(page, 'Dangerous').click()
    await expect(blockCountStatus(page)).toHaveText('1 of 9 blocks match')

    await filterButton(page, 'External').click()

    await expect(filterButton(page, 'Dangerous')).toHaveAttribute('aria-pressed', 'true')
    await expect(filterButton(page, 'External')).toHaveAttribute('aria-pressed', 'true')
    await expect(blockCountStatus(page)).toHaveText('2 of 9 blocks match')
  })

  test('clearing filters restores every block and hides the clear control', async ({ page }) => {
    await filterButton(page, 'Dangerous').click()
    await filterButton(page, 'External').click()
    await expect(blockCountStatus(page)).toHaveText('2 of 9 blocks match')

    await clearFiltersButton(page).click()

    await expect(blockCountStatus(page)).toHaveText('9 blocks')
    await expect(clearFiltersButton(page)).toHaveCount(0)
    await expect(filterButton(page, 'Dangerous')).toHaveAttribute('aria-pressed', 'false')
    await expect(filterButton(page, 'External')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the findings filter hides reference blocks that carry no finding', async ({ page }) => {
    await expect(block(page, 'docs/guide.md, attached reference')).toBeVisible()

    await filterButton(page, 'Findings').click()

    await expect(block(page, 'docs/guide.md, attached reference')).toHaveCount(0)
    await expect(block(page, '../../.env')).toBeVisible()
    await expect(block(page, '/etc/passwd')).toBeVisible()
  })

  test('a filter that matches nothing shows the empty state', async ({ page }) => {
    await selectSample(page, sampleLabels.previewBuild)
    await expect(editorRegion(page, graphNames.previewBuild)).toBeVisible()

    await filterButton(page, 'Findings').click()

    await expect(blockCountStatus(page)).toHaveText('0 of 11 blocks match')
    await expect(blocks(page)).toHaveCount(0)
    await expect(page.getByText('No matching blocks')).toBeVisible()
  })
})
