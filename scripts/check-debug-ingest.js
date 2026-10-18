#!/usr/bin/env node
// Fails when a local debug-telemetry call (127.0.0.1:<port>/ingest) is present in source or
// in the shipped web bundles (mobile static export, Android assets, portal build).
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PATTERN = /(127\.0\.0\.1|localhost):\d{2,5}\/ingest/
const TARGETS = [
  'src',
  'credo-ui/mobile/pages',
  'credo-ui/mobile/components',
  'credo-ui/mobile/lib',
  'credo-ui/portal/pages',
  'credo-ui/portal/components',
  'credo-ui/portal/utils',
  'credo-ui/shared',
  'credo-ui/mobile/out',
  'credo-ui/mobile/android/app/src/main/assets',
  'credo-ui/portal/.next/static',
]
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.html'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'cache'])

const hits = []
function walk(target) {
  let stat
  try {
    stat = fs.statSync(target)
  } catch {
    return
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (!SKIP_DIRS.has(entry)) walk(path.join(target, entry))
    }
    return
  }
  if (!EXTENSIONS.has(path.extname(target))) return
  if (PATTERN.test(fs.readFileSync(target, 'utf8'))) hits.push(path.relative(ROOT, target))
}

for (const target of TARGETS) walk(path.join(ROOT, target))

if (hits.length > 0) {
  console.error('Debug ingest calls found (remove them and rebuild the bundles):')
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log('No debug ingest calls found.')
