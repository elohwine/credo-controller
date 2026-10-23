import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './keys'

interface FieldRun {
  id: string
  output?: Record<string, unknown>
}

/** Replace pre-step cache entries before handing the saved job back to the job screen. */
export async function refreshFieldRun<Run extends FieldRun>(
  client: QueryClient,
  scope: string,
  runId: string,
  load: () => Promise<Run>,
  assertCurrent: () => void,
): Promise<Run> {
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === scope &&
      (query.queryKey[1] === 'field-runs' || (query.queryKey[1] === 'field-run' && query.queryKey[2] === runId)),
  }
  assertCurrent()
  await client.cancelQueries(filters)
  const run = await load()
  assertCurrent()
  if (run?.id !== runId || !run.output || typeof run.output !== 'object' || Array.isArray(run.output)) {
    throw new Error('The updated job is not available yet. Try loading the next step again.')
  }
  await client.cancelQueries(filters)
  assertCurrent()
  client.setQueryData(queryKeys.fieldRun(scope, runId), [run])
  client.setQueriesData<Run[]>({ queryKey: [scope, 'field-runs'] }, (previous) =>
    previous ? [run, ...previous.filter((item) => item.id !== runId)] : previous,
  )
  return run
}
