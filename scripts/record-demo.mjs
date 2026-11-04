#!/usr/bin/env node
// Records docs/assets/demo.gif: a short scripted tour of the panel on the running demo stand.
//
//   make demo-gif            (stand up, Clockwork; needs ffmpeg and a Chromium)
//
// Frames come from Chromium's screencast (CDP), not Playwright's video recorder: that one needs
// Playwright's own ffmpeg build, which does not run on NixOS. The system ffmpeg makes the GIF.
// Screenshots have no system cursor, so the page gets a drawn one that follows the mouse.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'docs/assets/demo.gif')
const baseURL = `http://localhost:${process.env.DEMO_PORT ?? '18080'}`
const viewport = { width: 1280, height: 720 }
const gifWidth = 960
const fps = 12

/** Drawn cursor and caption overlay; pointer-events: none keeps them out of the way. */
function overlay() {
  const install = () => {
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    cursor.style.cssText = 'position:fixed;left:-40px;top:-40px;z-index:2147483647;pointer-events:none;transition:transform .12s'
    const caption = document.createElement('div')
    caption.id = 'demo-caption'
    caption.style.cssText = 'position:fixed;left:24px;top:20px;z-index:2147483646;pointer-events:none;padding:8px 14px;border-radius:8px;background:#00dc82;color:#0b0b0b;font:600 18px/1.3 system-ui,sans-serif;opacity:0;transition:opacity .25s;box-shadow:0 6px 20px rgb(0 0 0/35%)'
    document.documentElement.append(cursor, caption)
    addEventListener('mousemove', (event) => {
      cursor.style.left = `${event.clientX - 3}px`
      cursor.style.top = `${event.clientY - 2}px`
    }, true)
    addEventListener('mousedown', () => {
      cursor.style.transform = 'scale(.8)'
    }, true)
    addEventListener('mouseup', () => {
      cursor.style.transform = ''
    }, true)
  }
  if (document.documentElement) {
    install()
  }
  else {
    addEventListener('DOMContentLoaded', install)
  }
}

async function caption(page, text) {
  await page.evaluate((value) => {
    const element = document.getElementById('demo-caption')
    if (element) {
      element.textContent = value
      element.style.opacity = value ? '1' : '0'
    }
  }, text)
}

async function center(locator) {
  const box = await locator.boundingBox()
  if (!box) {
    throw new Error(`not visible: ${locator}`)
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const { x, y } = await center(locator)
  await page.mouse.move(x, y, { steps: 18 })
  await page.waitForTimeout(250)
}

async function click(page, locator, pause = 900) {
  await pointAt(page, locator)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(pause)
}

async function drag(page, locator, dx, dy) {
  const { x, y } = await center(locator)
  await page.mouse.move(x, y, { steps: 18 })
  await page.waitForTimeout(250)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 24 })
  await page.mouse.up()
  await page.waitForTimeout(700)
}

async function tour(page, startRecording) {
  const panel = page.getByTestId('backend-lens-panel')
  const request = text => panel.getByRole('listitem').filter({ hasText: text }).first()
  const tab = id => panel.getByTestId(`backend-lens-tab-${id}`)
  const nav = label => page.locator('nav').getByRole('link', { name: label })

  await page.goto('/books')
  await page.getByTestId('backend-lens-badge-issues').waitFor()
  await page.mouse.move(640, 200)
  await startRecording()
  await caption(page, 'Every backend request of the SPA, with what the backend recorded')
  await page.waitForTimeout(1200)
  await click(page, page.getByTestId('backend-lens-badge'))

  await click(page, request(/GET\/api\/books\d/), 1200)
  await caption(page, 'N+1 detected: 30 queries from one call site')
  const issue = panel.getByTestId('backend-lens-issue-n-plus-one')
  await click(page, issue, 1600)
  await caption(page, 'Click again to collapse')
  await click(page, issue, 1000)
  await caption(page, 'Server timeline: queries and events on one axis')
  await click(page, tab('timeline'), 1600)

  await caption(page, 'Logs, cache and timing per request')
  await click(page, nav('Logs'), 800)
  await click(page, request(/GET\/api\/logs\d/), 400)
  await click(page, tab('logs'), 1600)

  await click(page, nav('HTTP clients'), 900)
  await caption(page, 'Resizable, with a list / details splitter')
  await drag(page, panel.getByTestId('backend-lens-resize-height'), 0, 190)
  await drag(page, panel.getByTestId('backend-lens-splitter'), 90, 0)

  await caption(page, 'Requests grouped by the user action that caused them')
  await click(page, page.getByRole('button', { name: 'Run all' }), 900)
  await pointAt(page, panel.getByTestId('backend-lens-action').filter({ hasText: 'Run all' }))
  await page.waitForTimeout(2000)
  await caption(page, '')
  await page.waitForTimeout(600)
}

/** Runs the tour while saving screencast frames; returns them with their timestamps (seconds). */
async function record(frameDir) {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  const context = await browser.newContext({ baseURL, viewport, colorScheme: 'dark' })
  await context.addInitScript(overlay)
  const page = await context.newPage()
  const session = await context.newCDPSession(page)
  const frames = []
  session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(frameDir, `${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, time: metadata.timestamp })
    void session.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  const startRecording = () => session.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: viewport.width,
    maxHeight: viewport.height,
  })
  try {
    await tour(page, startRecording)
    await session.send('Page.stopScreencast')
  }
  finally {
    await context.close()
    await browser.close()
  }
  return frames
}

/** Frames arrive only when the page changes: each one is shown until the next. */
function toGif(frames, frameDir, gif) {
  if (frames.length < 2) {
    throw new Error('no frames recorded')
  }
  const lines = []
  frames.forEach((frame, index) => {
    const next = frames[index + 1]
    lines.push(`file '${frame.file}'`, `duration ${next ? Math.max(next.time - frame.time, 0.001).toFixed(3) : '1.000'}`)
  })
  lines.push(`file '${frames.at(-1).file}'`)
  const list = join(frameDir, 'frames.txt')
  writeFileSync(list, `${lines.join('\n')}\n`)

  mkdirSync(dirname(gif), { recursive: true })
  const filters = `fps=${fps},scale=${gifWidth}:-1:flags=lanczos,split[a][b];`
    + '[a]palettegen=max_colors=128:stats_mode=diff[p];'
    + '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', filters, '-loop', '0', gif], { stdio: 'inherit' })
  return frames.at(-1).time - frames[0].time
}

const frameDir = mkdtempSync(join(tmpdir(), 'backend-lens-demo-'))
try {
  const frames = await record(frameDir)
  const seconds = toGif(frames, frameDir, output)
  console.log(`${output}: ${seconds.toFixed(1)} s, ${frames.length} frames, ${(statSync(output).size / 1024 / 1024).toFixed(2)} MB`)
}
finally {
  rmSync(frameDir, { recursive: true, force: true })
}
