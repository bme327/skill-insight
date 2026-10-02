import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  block,
  clearFiltersButton,
  confidenceOutput,
  confidenceSlider,
  editorRegion,
  filterButton,
  graphNames,
  inspector,
  levelButton,
  openSample,
  redoButton,
  sampleLabels,
  selectSample,
  undoButton,
  wideViewport,
} from './helpers.js'

test.use({ viewport: wideViewport })

test.describe('inspector field edits', () => {
  test.beforeEach(async ({ page }) => {
    await openSample(page, 'traversal')
    // Detail keeps same-kind chains expanded, so an edit cannot regroup the block away.
    await levelButton(page, 'Detail').click()
  })

  test('editing the title renames the block on the canvas', async ({ page }) => {
    await block(page, 'Read the local guide').click()

    await inspector(page).getByLabel('Title').fill('Read the onboarding guide')

    await expect(inspector(page).getByLabel('Title')).toHaveValue('Read the onboarding guide')
    await expect(inspector(page).getByRole('heading', { name: 'Read the onboarding guide' })).toBeVisible()
    await expect(block(page, 'Read the onboarding guide')).toBeVisible()
    await expect(block(page, 'Read the local guide')).toHaveCount(0)
  })

  test('editing the kind restyles the block and keeps it on the canvas', async ({ page }) => {
    const target = block(page, 'Read the local guide')
    await target.click()
    await expect(target).toContainText('action')

    await inspector(page).getByLabel('Kind').selectOption('condition')

    await expect(inspector(page).getByLabel('Kind')).toHaveValue('condition')
    await expect(target).toContainText('condition')
    await expect(target).toHaveAttribute('aria-pressed', 'true')
  })

  test('the kind select only accepts kinds the schema knows', async ({ page }) => {
    await block(page, 'Read the local guide').click()

    const kinds = await inspector(page).getByLabel('Kind').locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value))

    expect(kinds).toEqual([
      'trigger',
      'input',
      'instruction',
      'condition',
      'action',
      'toolCall',
      'permission',
      'validation',
      'output',
      'errorPath',
      'reference',
    ])
  })

  test('editing the detail updates the block summary', async ({ page }) => {
    const target = block(page, 'Read the local guide')
    await target.click()

    await inspector(page).getByLabel('Detail').fill('Reads docs/guide.md from the workspace root')

    await expect(inspector(page).getByLabel('Detail')).toHaveValue('Reads docs/guide.md from the workspace root')
    await expect(target).toContainText('Reads docs/guide.md from the workspace root')
  })

  test('the confidence slider and its readout move together', async ({ page }) => {
    await block(page, 'collect-config').click()
    await expect(confidenceOutput(page)).toHaveText('100%')

    await confidenceSlider(page).focus()
    await page.keyboard.press('ArrowLeft')

    await expect(confidenceSlider(page)).toHaveValue('0.95')
    await expect(confidenceOutput(page)).toHaveText('95%')

    await page.keyboard.press('ArrowRight')

    await expect(confidenceSlider(page)).toHaveValue('1')
    await expect(confidenceOutput(page)).toHaveText('100%')
  })
})

test.describe('undo and redo', () => {
  const original = 'Read the local guide'
  const renamed = 'Read the onboarding guide'

  test.beforeEach(async ({ page }) => {
    await openSample(page, 'traversal')
    await levelButton(page, 'Detail').click()
    await block(page, original).click()
  })

  test('both controls start disabled with nothing to move through', async ({ page }) => {
    await expect(undoButton(page)).toBeDisabled()
    await expect(redoButton(page)).toBeDisabled()
  })

  test('an edit enables undo but leaves nothing to redo', async ({ page }) => {
    await inspector(page).getByLabel('Title').fill(renamed)

    await expect(undoButton(page)).toBeEnabled()
    await expect(redoButton(page)).toBeDisabled()
  })

  test('undo restores the previous value and offers it back through redo', async ({ page }) => {
    await inspector(page).getByLabel('Title').fill(renamed)

    await undoButton(page).click()

    await expect(inspector(page).getByLabel('Title')).toHaveValue(original)
    await expect(block(page, original)).toBeVisible()
    await expect(block(page, renamed)).toHaveCount(0)
    await expect(redoButton(page)).toBeEnabled()
    await expect(undoButton(page)).toBeDisabled()

    await redoButton(page).click()

    await expect(inspector(page).getByLabel('Title')).toHaveValue(renamed)
    await expect(block(page, renamed)).toBeVisible()
    await expect(redoButton(page)).toBeDisabled()
    await expect(undoButton(page)).toBeEnabled()
  })

  test('a fresh edit after an undo discards the redo future', async ({ page }) => {
    await inspector(page).getByLabel('Title').fill(renamed)
    await undoButton(page).click()
    await expect(redoButton(page)).toBeEnabled()

    await inspector(page).getByLabel('Detail').fill('A different edit entirely')

    await expect(redoButton(page)).toBeDisabled()
    await expect(undoButton(page)).toBeEnabled()

    await undoButton(page).click()

    await expect(inspector(page).getByLabel('Title')).toHaveValue(original)
  })

  test('a no-op interaction records no history entry', async ({ page }) => {
    await block(page, 'collect-config').click()
    await expect(confidenceOutput(page)).toHaveText('100%')

    // The slider is already at its maximum, so this fires no change event.
    await confidenceSlider(page).focus()
    await page.keyboard.press('ArrowRight')

    await expect(confidenceOutput(page)).toHaveText('100%')
    await expect(undoButton(page)).toBeDisabled()
  })

  test('switching samples starts a fresh history', async ({ page }) => {
    await inspector(page).getByLabel('Title').fill(renamed)
    await expect(undoButton(page)).toBeEnabled()

    await selectSample(page, sampleLabels.previewBuild)
    await expect(editorRegion(page, graphNames.previewBuild)).toBeVisible()

    await expect(undoButton(page)).toBeDisabled()
    await expect(redoButton(page)).toBeDisabled()
  })
})

test.describe('drag to reposition', () => {
  /**
   * A pointer press starts a drag unconditionally; only actual pointer movement makes
   * `finishDrag` commit a position. That movement is the sole difference between a drag
   * and a selection click, so both behaviours are asserted here.
   */
  async function dragBy(
    page: Page,
    target: Locator,
    deltaX: number,
    deltaY: number,
  ): Promise<{ x: number; y: number }> {
    const box = await target.boundingBox()
    expect(box).not.toBeNull()
    if (box === null) throw new Error('The block is not rendered')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 })
    await page.mouse.up()
    return { x: box.x, y: box.y }
  }

  async function graphPosition(target: Locator): Promise<{ x: number; y: number }> {
    return target.evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('The block is not an HTML element')
      const x = Number.parseFloat(element.style.left)
      const y = Number.parseFloat(element.style.top)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('The block has no graph position')
      }
      return { x, y }
    })
  }

  test.beforeEach(async ({ page }) => {
    await openSample(page, 'traversal')
  })

  test('dragging a block moves it by the pointer delta', async ({ page }) => {
    const target = block(page, 'collect-config')

    const origin = await dragBy(page, target, 120, 90)

    const moved = await target.boundingBox()
    expect(moved).not.toBeNull()
    expect(moved?.x).toBeCloseTo(origin.x + 120, 0)
    expect(moved?.y).toBeCloseTo(origin.y + 90, 0)
  })

  test('a dragged position survives a re-render', async ({ page }) => {
    const target = block(page, 'collect-config')
    await dragBy(page, target, 120, 90)
    const moved = await target.boundingBox()

    await levelButton(page, 'Detail').click()
    await levelButton(page, 'Overview').click()

    await expect(target).toBeVisible()
    expect(await target.boundingBox()).toEqual(moved)
  })

  test('dragging at 50% zoom converts the pointer delta to graph coordinates', async ({ page }) => {
    const target = block(page, 'collect-config')
    const controls = page.getByRole('group', { name: 'Graph zoom controls' })
    const before = await graphPosition(target)

    for (let index = 0; index < 5; index += 1) {
      await controls.getByRole('button', { name: 'Zoom out' }).click()
    }
    await expect(controls.getByText('50%')).toBeVisible()

    await dragBy(page, target, 60, 45)

    const moved = await graphPosition(target)
    expect(moved.x).toBeCloseTo(before.x + 120, 0)
    expect(moved.y).toBeCloseTo(before.y + 90, 0)
  })

  test('a drag is undoable like any other edit', async ({ page }) => {
    const target = block(page, 'collect-config')

    const origin = await dragBy(page, target, 120, 90)
    await expect(undoButton(page)).toBeEnabled()

    await undoButton(page).click()

    const restored = await target.boundingBox()
    expect(restored?.x).toBeCloseTo(origin.x, 0)
    expect(restored?.y).toBeCloseTo(origin.y, 0)
  })

  test('a click without movement selects the block without repositioning it', async ({ page }) => {
    const target = block(page, 'collect-config')
    const before = await target.boundingBox()

    await target.click()

    await expect(target).toHaveAttribute('aria-pressed', 'true')
    expect(await target.boundingBox()).toEqual(before)
    await expect(undoButton(page)).toBeDisabled()
  })
})

test.describe('flow view persistence', () => {
  const groupLabel = '5 action blocks'
  const cleanReference = 'docs/guide.md, attached reference'

  /** The storage key embeds an opaque graph id, so it is discovered rather than hardcoded. */
  async function flowViewKey(page: Page, sourceFile: string): Promise<string> {
    const key = await page.evaluate(
      (file) => Object.keys(localStorage).find((candidate) => candidate.endsWith(file)),
      sourceFile,
    )
    expect(key).toBeDefined()
    return key ?? ''
  }

  test('the detail level and active filters survive a reload', async ({ page }) => {
    await openSample(page, 'traversal')
    await levelButton(page, 'Detail').click()
    await filterButton(page, 'Findings').click()
    await expect(block(page, cleanReference)).toHaveCount(0)

    await page.reload()
    await selectSample(page, sampleLabels.traversal)
    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()

    await expect(levelButton(page, 'Detail')).toHaveAttribute('aria-pressed', 'true')
    await expect(filterButton(page, 'Findings')).toHaveAttribute('aria-pressed', 'true')
    await expect(clearFiltersButton(page)).toBeVisible()
    await expect(block(page, cleanReference)).toHaveCount(0)
  })

  test('an expanded group stays expanded across a reload', async ({ page }) => {
    await openSample(page, 'traversal')
    await page.getByRole('button', { name: `Expand ${groupLabel}` }).click()
    await expect(block(page, 'Read the parent secrets')).toBeVisible()

    await page.reload()
    await selectSample(page, sampleLabels.traversal)
    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()

    await expect(block(page, 'Read the parent secrets')).toBeVisible()
    await expect(page.getByRole('button', { name: `Collapse ${groupLabel}` }).first()).toBeVisible()
  })

  test('each graph keeps its own independent view state', async ({ page }) => {
    await openSample(page, 'traversal')
    await levelButton(page, 'Detail').click()
    await filterButton(page, 'Findings').click()

    await selectSample(page, sampleLabels.previewBuild)
    await expect(editorRegion(page, graphNames.previewBuild)).toBeVisible()

    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'true')
    await expect(filterButton(page, 'Findings')).toHaveAttribute('aria-pressed', 'false')
    await expect(clearFiltersButton(page)).toHaveCount(0)

    await selectSample(page, sampleLabels.traversal)
    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()

    await expect(levelButton(page, 'Detail')).toHaveAttribute('aria-pressed', 'true')
    await expect(filterButton(page, 'Findings')).toHaveAttribute('aria-pressed', 'true')
  })

  test('malformed stored state falls back to the defaults', async ({ page }) => {
    await openSample(page, 'traversal')
    await levelButton(page, 'Detail').click()
    const key = await flowViewKey(page, 'path-traversal.md')

    await page.evaluate((storageKey) => localStorage.setItem(storageKey, 'not json at all'), key)
    await page.reload()
    await selectSample(page, sampleLabels.traversal)

    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'true')
    await expect(clearFiltersButton(page)).toHaveCount(0)
  })

  test('stored state that fails the schema falls back to the defaults', async ({ page }) => {
    await openSample(page, 'traversal')
    await levelButton(page, 'Detail').click()
    await filterButton(page, 'Findings').click()
    const key = await flowViewKey(page, 'path-traversal.md')

    await page.evaluate(
      (storageKey) => localStorage.setItem(storageKey, JSON.stringify({ level: 'zoomed-out', activeFilterIds: 'findings' })),
      key,
    )
    await page.reload()
    await selectSample(page, sampleLabels.traversal)

    await expect(editorRegion(page, graphNames.traversal)).toBeVisible()
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'true')
    await expect(filterButton(page, 'Findings')).toHaveAttribute('aria-pressed', 'false')
    await expect(block(page, cleanReference)).toBeVisible()
  })
})
