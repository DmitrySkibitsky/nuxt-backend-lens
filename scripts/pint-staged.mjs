#!/usr/bin/env node
// Laravel Pint on the given PHP files of the demo backend (lint-staged passes them). Uses the host
// PHP when there is one (fast; `nix develop` has it), otherwise the backend image.

import { spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'demo/backend')
const files = process.argv.slice(2).map(file => relative(backend, file))

if (files.length === 0) {
  process.exit(0)
}

const hostPhp = spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0
const result = hostPhp
  ? spawnSync('php', ['vendor/bin/pint', ...files], { cwd: backend, stdio: 'inherit' })
  : spawnSync('docker', ['compose', 'run', '--rm', '--no-deps', 'backend-tests', 'vendor/bin/pint', ...files], {
      cwd: join(root, 'demo'),
      stdio: 'inherit',
    })

process.exit(result.status ?? 1)
