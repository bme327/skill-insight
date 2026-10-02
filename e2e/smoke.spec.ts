import { expect, test } from '@playwright/test'

// Smoke coverage only: proves the harness drives the real browser host.
// Feature journeys land in later PRs.
test.describe('browser host smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders the visual editor for the default sample', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Visual editor for complex-release-review' })).toBeVisible()
  })

  test('renders at least one skill block on the canvas', async ({ page }) => {
    const blocks = page.getByRole('button', { name: /^Inspect / })
    await expect(blocks.first()).toBeVisible()
    expect(await blocks.count()).toBeGreaterThan(0)
  })

  test('renders the inspector and source panels', async ({ page }) => {
    await expect(page.getByRole('complementary', { name: 'Block inspector' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Skill source' })).toBeVisible()
    await expect(page.getByLabel('Skill source code')).toBeVisible()
  })

  test('exposes the detail level and filter controls', async ({ page }) => {
    await expect(page.getByRole('group', { name: 'Graph detail level' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Graph filters' })).toBeVisible()
  })

  test('navigates to the active skill search result with Enter', async ({ page }) => {
    const search = page.getByRole('combobox', { name: 'Go to skill' })
    await search.fill('p')

    await search.press('ArrowDown')
    await search.press('ArrowDown')
    const results = page.getByRole('listbox', { name: 'Matching skills' })
    await expect(results.getByRole('option', { selected: true })).toContainText('summarize-repo')

    await search.press('Enter')
    await expect(page.getByRole('region', { name: 'Visual editor for summarize-repo' })).toBeVisible()
  })

  test('zooms the graph and fits the complete flow', async ({ page }) => {
    const controls = page.getByRole('group', { name: 'Graph zoom controls' })
    const canvas = page.getByRole('region', { name: 'Graph canvas' })
    await expect(controls).toBeVisible()
    await expect(canvas).toBeVisible()
    await expect(controls.getByText('100%')).toBeVisible()

    await controls.getByRole('button', { name: 'Zoom out' }).click()
    await expect(controls.getByText('90%')).toBeVisible()

    const wheelCancelled = await canvas.evaluate((element) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 200,
        ctrlKey: true,
        deltaY: -100,
      })
      element.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(wheelCancelled).toBe(true)
    await expect(controls.getByText('100%')).toBeVisible()

    await page.getByRole('button', { name: 'Detail' }).click()
    const minimap = page.getByRole('button', { name: 'Pan graph using minimap' })
    await expect(minimap).toBeVisible()

    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    if (canvasBox === null) throw new Error('The graph canvas is not rendered')
    const panStartX = canvasBox.x + canvasBox.width - 48
    const panStartY = canvasBox.y + 48
    await page.mouse.move(panStartX, panStartY)
    await page.mouse.down()
    await page.mouse.move(panStartX - 160, panStartY - 120, { steps: 10 })
    await page.mouse.up()
    await expect.poll(() => canvas.evaluate((element) =>
      element.scrollLeft + element.scrollTop)).toBeGreaterThan(0)

    await minimap.press('Home')
    await expect.poll(() => canvas.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }))).toEqual({ left: 0, top: 0 })

    const minimapGeometry = await minimap.evaluate((element) => {
      const svg = element.querySelector('svg')
      if (!(svg instanceof SVGSVGElement)) throw new Error('The minimap SVG is not rendered')
      const bounds = svg.getBoundingClientRect()
      return {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        graphWidth: svg.viewBox.baseVal.width,
        graphHeight: svg.viewBox.baseVal.height,
      }
    })
    const canvasGeometry = await canvas.evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      maxLeft: element.scrollWidth - element.clientWidth,
      maxTop: element.scrollHeight - element.clientHeight,
    }))
    const minimapTarget = { x: 0.65, y: 0.65 }
    await page.mouse.click(
      minimapGeometry.left + minimapGeometry.width * minimapTarget.x,
      minimapGeometry.top + minimapGeometry.height * minimapTarget.y,
    )
    const expectedScroll = {
      left: Math.min(
        canvasGeometry.maxLeft,
        Math.max(0, minimapGeometry.graphWidth * minimapTarget.x - canvasGeometry.width / 2),
      ),
      top: Math.min(
        canvasGeometry.maxTop,
        Math.max(0, minimapGeometry.graphHeight * minimapTarget.y - canvasGeometry.height / 2),
      ),
    }
    await expect.poll(() => canvas.evaluate((element, expected) =>
      Math.abs(element.scrollLeft - expected.left)
      + Math.abs(element.scrollTop - expected.top), expectedScroll)).toBeLessThan(2)

    await minimap.press('Home')
    const startingScrollTop = await canvas.evaluate((element) => element.scrollTop)
    await minimap.press('ArrowDown')
    await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(startingScrollTop)

    await controls.getByRole('button', { name: 'Fit graph to view' }).click()
    await expect(minimap).toBeHidden()
    const fittedZoom = await controls.locator('output').textContent()
    await canvas.dispatchEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200,
      ctrlKey: true,
      deltaY: 100,
    })
    await expect(controls.locator('output')).toHaveText(fittedZoom ?? '')

    const search = page.getByRole('combobox', { name: 'Go to skill' })
    await search.fill('summarize')
    await search.press('Enter')
    await expect(page.getByRole('region', { name: 'Visual editor for summarize-repo' })).toBeVisible()
    await expect(controls.getByText('100%')).toBeVisible()
    await expect.poll(() => canvas.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }))).toEqual({ left: 0, top: 0 })
  })
})
