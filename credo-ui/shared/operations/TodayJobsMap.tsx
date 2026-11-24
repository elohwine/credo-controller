import { useState } from 'react'
import { Alert, Box, Button, Checkbox, Group, Loader, Paper, Stack, Text } from '@mantine/core'

import type { OperationsApi, TodayJobsMap as TodayJobsMapData } from './operationsApi'

const WIDTH = 720
const HEIGHT = 360
const TILE = 256

function project(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom
  const sin = Math.sin((latitude * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function MapImage({ data, onOpen }: { data: TodayJobsMapData; onOpen: (runId: string) => void }) {
  const [zoom, setZoom] = useState(9)
  if (!data.jobs.length) return null

  const centerLatitude = data.jobs.reduce((sum, job) => sum + Number(job.latitude), 0) / data.jobs.length
  const centerLongitude = data.jobs.reduce((sum, job) => sum + Number(job.longitude), 0) / data.jobs.length
  const center = project(centerLatitude, centerLongitude, zoom)
  const originX = center.x * TILE - WIDTH / 2
  const originY = center.y * TILE - HEIGHT / 2
  const minTileX = Math.floor(originX / TILE)
  const minTileY = Math.floor(originY / TILE)
  const maxTileX = Math.floor((originX + WIDTH) / TILE)
  const maxTileY = Math.floor((originY + HEIGHT) / TILE)
  const tileCount = 2 ** zoom
  const tiles = []
  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileCount) continue
      const wrappedX = ((x % tileCount) + tileCount) % tileCount
      tiles.push(
        <image
          key={`${zoom}:${wrappedX}:${y}:${x}`}
          href={`https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`}
          x={x * TILE - originX}
          y={y * TILE - originY}
          width={TILE}
          height={TILE}
        />,
      )
    }
  }

  return (
    <Box>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          {data.jobs.length} mapped job{data.jobs.length === 1 ? '' : 's'} for {data.date}
        </Text>
        <Group gap={4}>
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(4, value - 1))}
          >
            −
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(17, value + 1))}
          >
            +
          </Button>
        </Group>
      </Group>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Map of ${data.jobs.length} jobs scheduled for ${data.date}`}
        style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8, background: '#e8eef0' }}
      >
        {tiles}
        {data.jobs.map((job, index) => {
          const point = project(Number(job.latitude), Number(job.longitude), zoom)
          const x = point.x * TILE - originX
          const y = point.y * TILE - originY
          return (
            <g
              key={job.runId}
              role="button"
              tabIndex={0}
              aria-label={`Open job ${job.reference} at ${job.location}`}
              onClick={() => onOpen(job.runId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpen(job.runId)
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={x}
                cy={y}
                r={13}
                fill={job.priority === 'urgent' ? '#c92a2a' : '#1971c2'}
                stroke="white"
                strokeWidth={3}
              />
              <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight={700}>
                {index + 1}
              </text>
              <title>{`${job.reference} · ${job.description} · ${job.location}`}</title>
            </g>
          )
        })}
      </svg>
      <Text size="xs" c="dimmed" ta="right" mt={4}>
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
      </Text>
      <Stack gap={4} mt="xs">
        {data.jobs.slice(0, 8).map((job, index) => (
          <Button
            key={job.runId}
            variant="subtle"
            color="dark"
            size="compact-sm"
            justify="flex-start"
            onClick={() => onOpen(job.runId)}
          >
            {index + 1}. {job.reference} · {job.storeNumber ? `Store ${job.storeNumber}` : job.location}
          </Button>
        ))}
        {data.jobs.length > 8 && (
          <Text size="xs" c="dimmed">
            Select a pin on the map for the other jobs.
          </Text>
        )}
      </Stack>
    </Box>
  )
}

export function TodayJobsMap({ api, onOpen }: { api: OperationsApi; onOpen: (runId: string) => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [data, setData] = useState<TodayJobsMapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!confirmed) return
    setLoading(true)
    setError('')
    try {
      setData(await api.geocodeTodayJobs(10))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The job locations could not be mapped.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <div>
          <Text fw={600}>Today’s jobs map</Text>
          <Text size="sm" c="dimmed">
            See today’s scheduled sites and open a job directly from the map.
          </Text>
        </div>
        <Alert color="blue" variant="light" title="Site locations and OpenStreetMap">
          When you load the map, today’s job addresses are sent to OpenStreetMap’s geocoder and the visible map area is
          requested from its tile server. Choose to share those locations before proceeding.
        </Alert>
        <Checkbox
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          label="I agree to share today’s job addresses with OpenStreetMap to show their locations."
        />
        <Group>
          <Button onClick={() => void load()} disabled={!confirmed} loading={loading}>
            {data?.pendingLocations ? `Find next 10 locations (${data.pendingLocations} left)` : 'Load today’s map'}
          </Button>
          {data && (
            <Text size="sm" c="dimmed">
              {data.pendingLocations
                ? `${data.pendingLocations} more location${data.pendingLocations === 1 ? '' : 's'} can be mapped.`
                : ''}
              {data.notFoundLocations ? ` ${data.notFoundLocations} could not be located.` : ''}
            </Text>
          )}
        </Group>
        {loading && <Loader size="sm" />}
        {error && <Alert color="red">{error}</Alert>}
        {data && data.jobs.length === 0 && !data.pendingLocations && (
          <Text size="sm" c="dimmed">
            No locations were found for today’s scheduled jobs.
          </Text>
        )}
        {data && data.jobs.length > 0 && <MapImage data={data} onOpen={onOpen} />}
      </Stack>
    </Paper>
  )
}
