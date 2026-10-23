import { createRequire } from 'module'
import path from 'path'
import { describe, expect, jest, test } from '@jest/globals'
import { queryKeys } from '../credo-ui/mobile/lib/queries/keys'
import { refreshFieldRun } from '../credo-ui/mobile/lib/queries/refreshFieldRun'

const { QueryClient } = createRequire(path.resolve('credo-ui/mobile/package.json'))(
  '@tanstack/react-query',
) as typeof import('../credo-ui/mobile/node_modules/@tanstack/react-query')

const scope = 'account-1|org:org-1'
const oldRun = { id: 'run-1', output: { pauseReason: 'await_evidence_before' } }
const nextRun = { id: 'run-1', output: { pauseReason: 'await_evidence_receipt' } }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('loading the saved field step', () => {
  test('waits for the slow response, then replaces both detail and list before handing back the job', async () => {
    const client = new QueryClient()
    const response = deferred<typeof nextRun>()
    client.setQueryData(queryKeys.fieldRun(scope, oldRun.id), [oldRun])
    client.setQueryData(queryKeys.fieldRuns(scope), [oldRun, { id: 'other', output: {} }])
    const otherScope = 'account-2|org:org-1'
    client.setQueryData(queryKeys.fieldRuns(otherScope), [oldRun])
    const ready = jest.fn()

    const transition = refreshFieldRun(
      client,
      scope,
      oldRun.id,
      () => response.promise,
      () => undefined,
    ).then((run) => {
      expect(client.getQueryData(queryKeys.fieldRun(scope, run.id))).toEqual([nextRun])
      expect(client.getQueryData(queryKeys.fieldRuns(scope))).toEqual([nextRun, { id: 'other', output: {} }])
      ready(run)
    })
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    expect(client.getQueryData(queryKeys.fieldRun(scope, oldRun.id))).toEqual([oldRun])
    response.resolve(nextRun)
    await transition
    expect(ready).toHaveBeenCalledWith(nextRun)
    expect(client.getQueryData(queryKeys.fieldRuns(otherScope))).toEqual([oldRun])
    client.clear()
  })

  test('a failed refresh stays failed; retry only reloads and does not submit a step', async () => {
    const client = new QueryClient()
    client.setQueryData(queryKeys.fieldRun(scope, oldRun.id), [oldRun])
    const load = jest
      .fn<() => Promise<typeof nextRun>>()
      .mockRejectedValueOnce(new Error('Network timed out'))
      .mockResolvedValueOnce(nextRun)
    await expect(refreshFieldRun(client, scope, oldRun.id, load, () => undefined)).rejects.toThrow('Network timed out')
    expect(client.getQueryData(queryKeys.fieldRun(scope, oldRun.id))).toEqual([oldRun])
    await expect(refreshFieldRun(client, scope, oldRun.id, load, () => undefined)).resolves.toEqual(nextRun)
    expect(load).toHaveBeenCalledTimes(2)
    client.clear()
  })

  test('cancels an older in-flight fetch so it cannot overwrite the next stage', async () => {
    const client = new QueryClient()
    const oldResponse = deferred<(typeof oldRun)[]>()
    const fetching = client
      .fetchQuery({
        queryKey: queryKeys.fieldRun(scope, oldRun.id),
        queryFn: () => oldResponse.promise,
      })
      .catch(() => undefined)
    await refreshFieldRun(
      client,
      scope,
      oldRun.id,
      async () => nextRun,
      () => undefined,
    )
    oldResponse.resolve([oldRun])
    await fetching
    expect(client.getQueryData(queryKeys.fieldRun(scope, oldRun.id))).toEqual([nextRun])
    client.clear()
  })

  test('does not save a response into a context that changed during loading', async () => {
    const client = new QueryClient()
    let current = true
    const assertCurrent = () => {
      if (!current) throw new Error('Context changed')
    }
    await expect(
      refreshFieldRun(
        client,
        scope,
        oldRun.id,
        async () => {
          current = false
          return nextRun
        },
        assertCurrent,
      ),
    ).rejects.toThrow('Context changed')
    expect(client.getQueryData(queryKeys.fieldRun(scope, oldRun.id))).toBeUndefined()
    client.clear()
  })

  test('does not present a different job or an incomplete response as the next step', async () => {
    const client = new QueryClient()
    await expect(
      refreshFieldRun(
        client,
        scope,
        oldRun.id,
        async () => ({
          id: 'wrong-run',
          output: {},
        }),
        () => undefined,
      ),
    ).rejects.toThrow('updated job is not available')
    await expect(
      refreshFieldRun(
        client,
        scope,
        oldRun.id,
        async () => ({
          id: oldRun.id,
        }),
        () => undefined,
      ),
    ).rejects.toThrow('updated job is not available')
    expect(client.getQueryData(queryKeys.fieldRun(scope, oldRun.id))).toBeUndefined()
    client.clear()
  })
})
