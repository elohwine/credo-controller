import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionIcon, Alert, Anchor, Badge, Box, Button, Checkbox, Group, Paper, Stack, Text } from '@mantine/core'
import { IconExternalLink, IconMapPin, IconMinus, IconPlus, IconRoute } from '@tabler/icons-react'

import type { OperationsApi, TodayJobsMap as TodayJobsMapData, TodayMapJob } from './operationsApi'

const WIDTH = 720
const HEIGHT = 380
const TILE = 256
const PADDING = 48
const MAX_FIT_ZOOM = 15
const CONSENT_KEY = 'ldkJobMapConsent'

function project(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom
  const sin = Math.sin((Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

/** The closest zoom that keeps every pin on screen, and the centre of the pins (world units at zoom 0). */
function fitView(jobs: TodayMapJob[]): { zoom: number; center: { x: number; y: number } } {
  const points = jobs.map((job) => project(Number(job.latitude), Number(job.longitude), 0))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const fitX = spanX > 0 ? Math.log2((WIDTH - PADDING * 2) / TILE / spanX) : MAX_FIT_ZOOM
  const fitY = spanY > 0 ? Math.log2((HEIGHT - PADDING * 2) / TILE / spanY) : MAX_FIT_ZOOM
  return {
    zoom: Math.max(3, Math.min(MAX_FIT_ZOOM, Math.floor(Math.min(fitX, fitY)))),
    center: { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 },
  }
}

export function directionsUrl(job: TodayMapJob): string {
  // An approximate pin is only the postcode district; the written address takes the driver to the site.
  const destination = job.approximate ? job.location : `${job.latitude},${job.longitude}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

function pinColor(job: TodayMapJob): string {
  return job.priority === 'urgent' ? 'var(--mantine-color-red-7)' : 'var(--mantine-primary-color-filled)'
}

function JobLine({
  job,
  number,
  selected,
  onSelect,
  onOpen,
}: {
  job: TodayMapJob
  number: number
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  return (
    <Paper
      withBorder
      radius="sm"
      px="sm"
      py={8}
      onClick={onSelect}
      style={{
        cursor: 'pointer',
        borderColor: selected ? 'var(--mantine-primary-color-filled)' : undefined,
        background: selected ? 'var(--mantine-primary-color-light)' : undefined,
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Box
            w={24}
            h={24}
            style={{
              flex: 'none',
              borderRadius: '50%',
              background: pinColor(job),
              color: 'white',
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {number}
          </Box>
          <div style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600} truncate>
                {job.reference}
              </Text>
              {job.priority === 'urgent' && (
                <Badge size="xs" color="red" variant="light">
                  Urgent
                </Badge>
              )}
              {job.approximate && (
                <Badge size="xs" color="gray" variant="light">
                  Area only
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {job.storeNumber ? `Store ${job.storeNumber} · ` : ''}
              {job.location}
            </Text>
          </div>
        </Group>
        <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
          <Button
            component="a"
            href={directionsUrl(job)}
            target="_blank"
            rel="noreferrer"
            size="compact-xs"
            variant="default"
            leftSection={<IconRoute size={14} />}
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          >
            Directions
          </Button>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Open job ${job.reference}`}
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            <IconExternalLink size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  )
}

function MapImage({ data, onOpen }: { data: TodayJobsMapData; onOpen: (runId: string) => void }) {
  const fit = useMemo(() => fitView(data.jobs), [data.jobs])
  const [zoomShift, setZoomShift] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => setZoomShift(0), [fit.zoom])

  const zoom = Math.max(3, Math.min(17, fit.zoom + zoomShift))
  const scale = 2 ** zoom
  const originX = fit.center.x * scale * TILE - WIDTH / 2
  const originY = fit.center.y * scale * TILE - HEIGHT / 2
  const tileCount = 2 ** zoom
  const tiles = []
  for (let x = Math.floor(originX / TILE); x <= Math.floor((originX + WIDTH) / TILE); x += 1) {
    for (let y = Math.floor(originY / TILE); y <= Math.floor((originY + HEIGHT) / TILE); y += 1) {
      if (y < 0 || y >= tileCount) continue
      const wrappedX = ((x % tileCount) + tileCount) % tileCount
      tiles.push(
        <image
          key={`${zoom}:${x}:${y}`}
          href={`https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`}
          x={x * TILE - originX}
          y={y * TILE - originY}
          width={TILE}
          height={TILE}
        />,
      )
    }
  }

  // Several jobs at one store share a point: fan them out so each pin can be picked.
  const seen = new Map<string, number>()
  const pins = data.jobs.map((job, index) => {
    const point = project(Number(job.latitude), Number(job.longitude), zoom)
    const spot = `${Math.round(point.x * TILE)}:${Math.round(point.y * TILE)}`
    const clash = seen.get(spot) ?? 0
    seen.set(spot, clash + 1)
    const angle = clash * 2.4
    const spread = clash ? 16 + clash * 2 : 0
    return {
      job,
      number: index + 1,
      x: point.x * TILE - originX + Math.cos(angle) * spread,
      y: point.y * TILE - originY + Math.sin(angle) * spread,
    }
  })
  const active = pins.find((pin) => pin.job.runId === selected)
  const listed = showAll ? pins : pins.slice(0, 6)

  return (
    <Stack gap="xs">
      <Box pos="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Map of ${data.jobs.length} jobs scheduled for ${data.date}`}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default-hover)',
          }}
        >
          {tiles}
          {[...pins.filter((pin) => pin !== active), ...(active ? [active] : [])].map((pin) => (
            <g
              key={pin.job.runId}
              role="button"
              tabIndex={0}
              aria-label={`Job ${pin.job.reference} at ${pin.job.location}`}
              onClick={() => setSelected(pin.job.runId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setSelected(pin.job.runId)
              }}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              {pin.job.approximate && (
                <circle cx={pin.x} cy={pin.y} r={24} fill={pinColor(pin.job)} fillOpacity={0.12} />
              )}
              <circle
                cx={pin.x}
                cy={pin.y}
                r={pin === active ? 16 : 13}
                fill={pinColor(pin.job)}
                stroke="white"
                strokeWidth={3}
                strokeDasharray={pin.job.approximate ? '4 3' : undefined}
              />
              <text x={pin.x} y={pin.y + 4} textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>
                {pin.number}
              </text>
              <title>{`${pin.job.reference} · ${pin.job.location}`}</title>
            </g>
          ))}
        </svg>
        <Stack gap={4} pos="absolute" top={8} right={8}>
          <ActionIcon
            variant="default"
            aria-label="Zoom in"
            onClick={() => setZoomShift((value) => Math.min(17 - fit.zoom, value + 1))}
          >
            <IconPlus size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            aria-label="Zoom out"
            onClick={() => setZoomShift((value) => Math.max(3 - fit.zoom, value - 1))}
          >
            <IconMinus size={16} />
          </ActionIcon>
        </Stack>
      </Box>
      <Group justify="space-between" gap="xs">
        <Text size="xs" c="dimmed">
          Select a pin or a job below. Dashed pins are placed by postcode area only.
        </Text>
        <Text size="xs" c="dimmed">
          ©{' '}
          <Anchor href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" inherit>
            OpenStreetMap contributors
          </Anchor>
        </Text>
      </Group>
      <Stack gap={6}>
        {listed.map((pin) => (
          <JobLine
            key={pin.job.runId}
            job={pin.job}
            number={pin.number}
            selected={pin === active}
            onSelect={() => setSelected(pin.job.runId)}
            onOpen={() => onOpen(pin.job.runId)}
          />
        ))}
        {active && !listed.includes(active) && (
          <JobLine
            job={active.job}
            number={active.number}
            selected
            onSelect={() => undefined}
            onOpen={() => onOpen(active.job.runId)}
          />
        )}
        {pins.length > listed.length && (
          <Button variant="subtle" size="compact-sm" onClick={() => setShowAll(true)}>
            Show all {pins.length} jobs
          </Button>
        )}
      </Stack>
    </Stack>
  )
}

export function TodayJobsMap({ api, onOpen }: { api: OperationsApi; onOpen: (runId: string) => void }) {
  const [consented, setConsented] = useState(false)
  const [agree, setAgree] = useState(false)
  const [data, setData] = useState<TodayJobsMapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)

  const findLocations = async () => {
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

  // Places found before are kept on our server, so they show without asking anything new.
  // New addresses are looked up once someone in this browser has agreed to share them.
  useEffect(() => {
    if (started.current) return
    started.current = true
    const agreed = typeof window !== 'undefined' && window.localStorage.getItem(CONSENT_KEY) === '1'
    setConsented(agreed)
    setLoading(true)
    api
      .todayJobsMap()
      .then(async (cached) => {
        setData(cached)
        if (agreed && cached.pendingLocations) await findLocations()
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'The map could not be loaded.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const giveConsent = async () => {
    window.localStorage.setItem(CONSENT_KEY, '1')
    setConsented(true)
    await findLocations()
  }

  const total = data ? data.jobs.length + data.pendingLocations + data.notFoundLocations : 0

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={600}>Today’s sites</Text>
            <Text size="sm" c="dimmed">
              {consented && data
                ? data.jobs.length
                  ? `${data.jobs.length} job${data.jobs.length === 1 ? '' : 's'} on the map for ${data.date}`
                  : `Open jobs scheduled for ${data.date}`
                : 'Where today’s scheduled jobs are, with directions for each site.'}
            </Text>
          </div>
          <IconMapPin size={20} color="var(--mantine-color-dimmed)" />
        </Group>

        {!consented && (
          <Alert color="gray" variant="light" title="Before the map looks up addresses">
            <Stack gap="xs">
              <Text size="sm">
                New job addresses are sent to postcodes.io (UK postcodes) and OpenStreetMap to find where they are, and
                map pictures are loaded from OpenStreetMap.
              </Text>
              <Checkbox
                checked={agree}
                onChange={(event) => setAgree(event.currentTarget.checked)}
                label="Share today’s job addresses to show them on the map"
              />
              <Group>
                <Button size="xs" disabled={!agree} loading={loading} onClick={() => void giveConsent()}>
                  Show today’s map
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {data?.notice && (
          <Alert color="yellow" variant="light">
            {data.notice}
          </Alert>
        )}

        {consented && data && data.jobs.length > 0 && <MapImage data={data} onOpen={onOpen} />}

        {consented && data && (data.pendingLocations > 0 || data.notFoundLocations > 0) && (
          <Group justify="space-between" gap="xs">
            <Text size="sm" c="dimmed">
              {data.pendingLocations
                ? `${data.pendingLocations} more site${data.pendingLocations === 1 ? '' : 's'} still to find.`
                : ''}
              {data.notFoundLocations
                ? ` ${data.notFoundLocations} address${data.notFoundLocations === 1 ? '' : 'es'} could not be placed — check the postcode on the job.`
                : ''}
            </Text>
            {data.pendingLocations > 0 && (
              <Button size="xs" variant="default" loading={loading} onClick={() => void findLocations()}>
                Find the next {Math.min(10, data.pendingLocations)}
              </Button>
            )}
          </Group>
        )}

        {data && total === 0 && !loading && (
          <Text size="sm" c="dimmed">
            No open jobs with an address are scheduled for today.
          </Text>
        )}
      </Stack>
    </Paper>
  )
}
