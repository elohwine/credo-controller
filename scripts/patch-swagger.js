// Patches generated swagger.json to include a global x-correlation-id header in all responses
// Run after `tsoa spec-and-routes` and before tsc

const fs = require('fs')
const path = require('path')

const swaggerPath = path.join(__dirname, '..', 'src', 'routes', 'swagger.json')

function injectHeader(responses) {
  if (!responses || typeof responses !== 'object') return
  for (const status of Object.keys(responses)) {
    const resp = responses[status]
    if (!resp || typeof resp !== 'object') continue
    resp.headers = resp.headers || {}
    if (!resp.headers['x-correlation-id']) {
      resp.headers['x-correlation-id'] = {
        description: 'Correlation ID for tracing across systems',
        schema: { type: 'string' },
      }
    }
  }
}

try {
  if (!fs.existsSync(swaggerPath)) {
    process.exit(0)
  }
  const raw = fs.readFileSync(swaggerPath, 'utf-8')
  const spec = JSON.parse(raw)
  if (spec && spec.paths) {
    for (const p of Object.keys(spec.paths)) {
      const item = spec.paths[p]
      for (const method of Object.keys(item)) {
        const op = item[method]
        if (op && op.responses) injectHeader(op.responses)
      }
    }
  }
  // Add a component header definition for reuse (informational)
  spec.components = spec.components || {}
  spec.components.headers = spec.components.headers || {}
  spec.components.headers['x-correlation-id'] = {
    description: 'Correlation ID for tracing across systems',
    schema: { type: 'string' },
  }
  fs.writeFileSync(swaggerPath, JSON.stringify(spec, null, 2))
   
  console.log('[patch-swagger] Injected x-correlation-id header in responses')
} catch (e) {
   
  console.warn('[patch-swagger] Failed to patch swagger.json:', e.message)
}
