import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestContext = {
  correlationId: string
  tenantId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}
