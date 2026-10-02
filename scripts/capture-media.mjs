import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import gifenc from 'gifenc'

const { applyPalette, GIFEncoder, quantize } = gifenc

const BASE_URL = 'http://127.0.0.1:5173'
const STILL_VIEWPORT = { width: 1500, height: 940 }
const GIF_VIEWPORT = { width: 1460, height: 800 }
const GIF_FRAME_MS = 1100

const levelButton = (page, label) =>
  page.getByRole('group', { name: 'Graph detail level' }).getByRole('button', { name: label, exact: true })
const filterButton = (page, label) =>
  page.getByRole('group', { name: 'Graph filters' }).getByRole('button', { name: label, exact: true })
const fitButton = (page) => page.getByRole('button', { name: 'Fit graph to view' })

async function openSample(page, label, graphName) {
  await page.goto(BASE_URL)
  await page.getByLabel('Sample').selectOption({ label })
  await page.getByRole('region', { name: `Visual editor for ${graphName}` }).waitFor()
  await page.waitForTimeout(350)
}

async function captureStills(browser) {
  const page = await browser.newPage({ viewport: STILL_VIEWPORT, deviceScaleFactor: 2 })

  // Flow view: a selected tool call, its inspector, and the source it maps back to.
  // No fit here - the complex graph fits only at ~16%, which is unreadable.
  await openSample(page, 'Complex release review', 'complex-release-review')
  await page.getByRole('button', { name: /^Inspect Use github_search/ }).first().click()
  await page.waitForTimeout(350)
  await writeFile('media/flow-view.png', await page.screenshot())

  // Findings: the adversarial prompt-injection fixture, expanded so each flagged step shows.
  await openSample(page, 'Prompt injection', 'summarize-repo')
  await levelButton(page, 'Detail').click()
  await filterButton(page, 'Findings').click()
  await fitButton(page).click()
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: /^Inspect Ignore all previous/ }).first().click()
  await page.waitForTimeout(350)
  await writeFile('media/findings.png', await page.screenshot())

  await page.close()
}

async function captureGif(browser) {
  const page = await browser.newPage({ viewport: GIF_VIEWPORT, deviceScaleFactor: 1 })
  const decoder = await browser.newPage()
  const frames = []

  const frame = async () => {
    await page.waitForTimeout(250)
    frames.push(await page.screenshot())
  }

  // The preview-build sample is small enough to read at 100%; fitting shrinks it too far.
  await openSample(page, 'Preview build', 'preview-build')
  await frame()

  await page.getByRole('button', { name: /^Inspect / }).nth(1).click()
  await frame()

  await levelButton(page, 'Grouped').click()
  await frame()

  await levelButton(page, 'Detail').click()
  await frame()

  await filterButton(page, 'External').click()
  await frame()

  await page.getByRole('button', { name: 'Clear graph filters' }).click()
  await levelButton(page, 'Overview').click()
  await frame()

  const gif = GIFEncoder()
  for (const png of frames) {
    // Playwright returns encoded PNGs; decode to RGBA in a page rather than adding a decoder dep.
    const { width, height, data } = await decoder.evaluate(async (base64) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
      return { width: bitmap.width, height: bitmap.height, data: [...image.data] }
    }, png.toString('base64'))

    const rgba = new Uint8ClampedArray(data)
    const palette = quantize(rgba, 128)
    gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: GIF_FRAME_MS })
  }
  gif.finish()
  await writeFile('media/demo.gif', Buffer.from(gif.bytes()))

  await decoder.close()
  await page.close()
}

await mkdir('media', { recursive: true })
const browser = await chromium.launch()
await captureStills(browser)
await captureGif(browser)
await browser.close()
console.log('captured media/flow-view.png, media/findings.png, media/demo.gif')
