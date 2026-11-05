#!/usr/bin/env node
// Packaged-consumption check: builds and packs nuxt-backend-lens, installs the tarball into a clean
// Nuxt app outside the workspace, then
//   1. BACKEND_LENS=1 production build → the toolbar works in a browser against a replayed record;
//   2. the same build with NUXT_PUBLIC_BACKEND_LENS_ENABLED=false → nothing patched or mounted;
//   3. BACKEND_LENS=0 production build → no trace of the module in the client bundle.
// Afterwards the module's stub build is restored, so the playground keeps working.
//
// Usage: node tests/package/check.mjs [--keep]   (--keep leaves tests/package/.work in place)

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const moduleDir = join(root, 'packages', 'nuxt-backend-lens')
const work = join(root, 'tests', 'package', '.work')
const app = join(work, 'app')
const keep = process.argv.includes('--keep')

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8', ...options })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})\n${result.stderr ?? ''}`)
  }
  return result.stdout ?? ''
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

function clientBundle() {
  const dir = join(app, '.output', 'public', '_nuxt')
  return readdirSync(dir).filter(file => file.endsWith('.js')).map(file => readFileSync(join(dir, file), 'utf8')).join('\n')
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    }
    catch {
      // not up yet
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${url} did not come up`)
}

function check(condition, message) {
  if (!condition) {
    throw new Error(`CHECK FAILED: ${message}`)
  }
  console.log(`  ✓ ${message}`)
}

async function withServer(env, callback) {
  const port = await freePort()
  const server = spawn('node', [join(app, '.output', 'server', 'index.mjs')], {
    cwd: app,
    env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'inherit',
  })
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`)
    await callback(port)
  }
  finally {
    server.kill()
  }
}

/** The plugin runs before the app mounts, so a native fetch on a loaded page means it bailed out. */
async function disabledBrowserCheck(port) {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.getByTestId('status').getByText('loaded').waitFor()
    const nativeFetch = await page.evaluate(() => Function.prototype.toString.call(window.fetch).includes('[native code]'))
    check(nativeFetch, 'runtime-disabled build: fetch is not patched')
    check(await page.locator('#backend-lens-toolbar').count() === 0, 'runtime-disabled build: no toolbar')
  }
  finally {
    await browser.close()
  }
}

async function browserCheck(port) {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.getByTestId('status').getByText('loaded').waitFor()
    const badge = page.getByTestId('backend-lens-badge')
    await badge.getByText('31 q').waitFor({ timeout: 10_000 })
    check(true, 'production build: badge shows the replayed request with 31 queries')
    await badge.click()
    await page.getByTestId('backend-lens-panel').getByRole('listitem').first().click()
    await page.getByTestId('backend-lens-issue-n-plus-one').waitFor()
    check(true, 'production build: the N+1 issue is detected')
    check(errors.length === 0, `production build: no page errors${errors.length ? ` (${errors.join('; ')})` : ''}`)
  }
  finally {
    await browser.close()
  }
}

async function main() {
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  run('pnpm', ['-F', 'nuxt-backend-lens', 'prepack'], { cwd: root })
  const packed = run('pnpm', ['pack', '--pack-destination', work], { cwd: moduleDir, capture: true })
  const tarball = readdirSync(work).find(file => file.endsWith('.tgz'))
  check(Boolean(tarball), `packed ${tarball}`)
  const files = run('tar', ['-tzf', join(work, tarball)], { capture: true }).split('\n')
  check(files.some(file => file.endsWith('dist/module.mjs')), 'tarball contains dist/module.mjs')
  check(!files.some(file => /\/(?:src|test|playground)\//.test(file)), 'tarball ships no src, tests or playground')
  check(!readFileSync(join(moduleDir, 'dist', 'module.mjs'), 'utf8').includes(root), 'dist has no absolute workspace paths (not a stub)')
  void packed

  cpSync(join(root, 'tests', 'package', 'fixture'), app, { recursive: true })
  cpSync(join(moduleDir, 'test', 'fixtures', 'records', 'clockwork', 'books-n-plus-one.json'), join(app, 'server', 'fixture.json'))
  // No lockfile: the tarball's integrity changes with every build. The app resolves its tree like a
  // new consumer would, so it pins Nuxt to the version the workspace lockfile installed, and skips
  // releases younger than a day (minimumReleaseAge, in minutes) so a freshly published, possibly
  // compromised version never runs here unreviewed.
  const nuxtVersion = JSON.parse(readFileSync(join(root, 'demo', 'frontend', 'node_modules', 'nuxt', 'package.json'), 'utf8')).version
  writeFileSync(join(app, 'package.json'), `${JSON.stringify({
    name: 'backend-lens-package-check',
    private: true,
    type: 'module',
    dependencies: { 'nuxt': nuxtVersion, 'nuxt-backend-lens': `file:../${tarball}` },
  }, null, 2)}\n`)
  writeFileSync(join(app, 'pnpm-workspace.yaml'), 'packages: []\nminimumReleaseAge: 1440\nallowBuilds:\n  esbuild: true\n  \'@parcel/watcher\': true\n')
  run('pnpm', ['install', '--prefer-offline'], { cwd: app })

  // 1. Enabled build works for real.
  run('pnpm', ['exec', 'nuxt', 'build'], { cwd: app, env: { ...process.env, BACKEND_LENS: '1' } })
  const enabledBundle = clientBundle()
  check(enabledBundle.includes('backend-lens-toolbar'), 'enabled build: the module is in the client bundle')
  check(!enabledBundle.includes('__BACKEND_LENS__'), 'enabled build: the lens is not published on window')
  await withServer({}, browserCheck)

  // 2. The same build, turned off through runtime config.
  await withServer({ NUXT_PUBLIC_BACKEND_LENS_ENABLED: 'false' }, disabledBrowserCheck)

  // 3. Disabled build carries nothing.
  run('pnpm', ['exec', 'nuxt', 'build'], { cwd: app, env: { ...process.env, BACKEND_LENS: '0' } })
  const bundle = clientBundle()
  check(!bundle.includes('__BACKEND_LENS__') && !bundle.includes('backend-lens'), 'disabled build: no module code in the client bundle')

  console.log('\nPackage check passed.')
}

main()
  .catch((error) => {
    console.error(`\n${error.message}`)
    process.exitCode = 1
  })
  .finally(() => {
    // Restore the stub build the playground and the workspace rely on.
    spawnSync('pnpm', ['-F', 'nuxt-backend-lens', 'dev:prepare'], { cwd: root, stdio: 'ignore' })
    if (!keep && existsSync(work)) {
      rmSync(work, { recursive: true, force: true })
    }
  })
