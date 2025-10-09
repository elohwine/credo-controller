#!/usr/bin/env node
import('../build/cli.js')
  .then((module) => {
    module.runCliServer()
  })
  .catch((err) => {
    console.error('Error starting CLI server:', err)
    process.exit(1)
  })
