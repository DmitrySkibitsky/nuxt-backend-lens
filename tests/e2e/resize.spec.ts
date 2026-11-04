import { expect, type Locator, type Page, test } from '@playwright/test'

// Panel size and list/details split. The toolbar panel is anchored bottom-right (the default
// position), so its left edge sets the width and its top edge the height.

test.use({ viewport: { width: 1400, height: 900 } })

async function openPanel(page: Page): Promise<Locator> {
  await page.goto('/stats')
  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()
  return panel
}

async function box(locator: Locator) {
  const result = await locator.boundingBox()
  if (!result) {
    throw new Error('element is not visible')
  }
  return result
}

/** Drags from the centre of `handle` by (dx, dy). */
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const start = await box(handle)
  const x = start.x + start.width / 2
  const y = start.y + start.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2)
  await page.mouse.move(x + dx, y + dy)
  await page.mouse.up()
}

test('the toolbar panel resizes by its inner edges and keeps the size across reloads', async ({ page }) => {
  const panel = await openPanel(page)
  const before = await box(panel)

  await drag(page, panel.getByTestId('backend-lens-resize-width'), -150, 0)
  await drag(page, panel.getByTestId('backend-lens-resize-height'), 0, -120)

  const after = await box(panel)
  expect(after.width).toBeCloseTo(before.width + 150, -1)
  expect(after.height).toBeCloseTo(before.height + 120, -1)
  // Anchored bottom-right: the right and bottom edges stay where they were.
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0)
  expect(after.y + after.height).toBeCloseTo(before.y + before.height, 0)

  await page.reload()
  const reopened = await openPanel(page)
  expect((await box(reopened)).width).toBeCloseTo(after.width, 0)
  expect((await box(reopened)).height).toBeCloseTo(after.height, 0)

  // Double-click resets an edge to the default size.
  await reopened.getByTestId('backend-lens-resize-width').dblclick()
  await expect.poll(async () => Math.round((await box(reopened)).width)).toBe(Math.round(before.width))
})

test('the panel never outgrows the viewport', async ({ page }) => {
  const panel = await openPanel(page)
  await drag(page, panel.getByTestId('backend-lens-resize-width'), -3000, 0)
  await drag(page, panel.getByTestId('backend-lens-resize-height'), 0, -3000)
  const size = await box(panel)
  expect(size.x).toBeGreaterThanOrEqual(0)
  expect(size.y).toBeGreaterThanOrEqual(0)
})

test('the splitter sets the request list width, also from the keyboard', async ({ page }) => {
  const panel = await openPanel(page)
  const list = panel.locator('.bl-list')
  const before = await box(list)

  await drag(page, panel.getByTestId('backend-lens-splitter'), 120, 0)
  const dragged = await box(list)
  expect(dragged.width).toBeCloseTo(before.width + 120, -1)

  await panel.getByTestId('backend-lens-splitter').focus()
  await page.keyboard.press('ArrowLeft')
  expect((await box(list)).width).toBeCloseTo(dragged.width - 16, 0)
})

test('the DevTools tab fills its frame: only the splitter resizes', async ({ page }) => {
  await page.goto('/stats')
  await page.evaluate(() => {
    const frame = document.createElement('iframe')
    frame.id = 'lens-tab'
    frame.src = '/__backend-lens/'
    // Fixed in view: mouse events only reach what is on screen.
    frame.style.cssText = 'position: fixed; inset: 0 auto auto 0; z-index: 2147483647; width: 1200px; height: 600px'
    document.body.appendChild(frame)
  })
  const tab = page.frameLocator('#lens-tab')
  const panel = tab.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()

  await expect(panel.getByTestId('backend-lens-resize-width')).toHaveCount(0)
  await expect(panel.getByTestId('backend-lens-resize-height')).toHaveCount(0)

  const list = panel.locator('.bl-list')
  const before = await box(list)
  await drag(page, panel.getByTestId('backend-lens-splitter'), 100, 0)
  expect((await box(list)).width).toBeCloseTo(before.width + 100, -1)
})
