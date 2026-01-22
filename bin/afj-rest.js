#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function stripFlag(flag) {
  process.argv = process.argv.filter((arg) => arg !== flag)
}

function startHolderServer() {
  const holderEntry = path.join(repoRoot, 'samples', 'startHolderServer.js')

  const child = spawn(process.execPath, [holderEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
    },
    stdio: 'inherit',
  })

  const shutdown = (signal) => {
    try {
      child.kill(signal)
    } catch (_) {
      // ignore
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('exit', () => shutdown('SIGTERM'))

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[afj-rest] Holder server exited with code ${code}`)
    }
  })

  return child
}

const WITH_HOLDER_FLAG = '--with-holder'

if (hasFlag(WITH_HOLDER_FLAG)) {
  stripFlag(WITH_HOLDER_FLAG)
  console.log('[afj-rest] Starting holder server...')
  startHolderServer()
}

import('../build/cli.js')
  .then((module) => module.runCliServer())
  .catch((err) => {
    console.error('Error starting CLI server:', err)
    process.exit(1)
  })
