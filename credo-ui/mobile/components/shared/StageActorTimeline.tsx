import React, { useState } from 'react'
import { Badge, Group, Image, Modal, Paper, Stack, Text, Timeline, UnstyledButton } from '@mantine/core'

import { StepHelp } from '@/components/help/StepHelp'
import { IconAlertTriangle, IconCheck, IconClock, IconFileText, IconMinus, IconUser } from '@tabler/icons-react'

import type { StageMediaItem } from '@/lib/jobAuditTrail'
import { formatTxnTime } from '@/lib/inboxAttention'
import { RelatedWorkLinks } from './JobHandoffsPanel'
import type { RelatedWorkLink } from '../../../shared/relatedWork'
import {
  actorDisplay,
  actorForStage,
  actorNeedsAssignment,
  proofWords,
  type JobActorStage,
  type JobStagePerson,
  type JobStageView,
} from '@/lib/uxCopy'

/** Phone twin of the website Progress list. */
export function StageActorTimeline({
  stages,
  actors,
  people,
  assigneeName,
  hasAssignee,
  whoDid,
  media,
  links,
  title = 'Progress',
  help,
}: {
  stages: JobStageView[]
  /** Header above the steps. Pass a count ("Progress (2 of 5 steps done)") when the page has one. */
  title?: string
  help?: { title: string; points: string[] }
  actors?: JobActorStage[]
  people?: JobStagePerson[]
  assigneeName?: string
  /** The job has a worker, even if their name is unknown. */
  hasAssignee?: boolean
  whoDid?: Record<string, string>
  media?: Record<string, StageMediaItem[]>
  links?: Record<string, RelatedWorkLink[]>
}) {
  const active = stages.reduce((last, stage, index) => (stage.status === 'pending' ? last : index), -1)
  const [preview, setPreview] = useState<StageMediaItem | null>(null)

  return (
    <>
      <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
        <Text fw={600}>{title}</Text>
        <StepHelp
          title={help?.title || 'Job progress'}
          points={help?.points || [
            'Each step shows what happens and who does it.',
            'A step is marked done when that person finishes it.',
            'The person named for a step gets it in their inbox.',
            'Photos and records on a step were taken for that step.',
          ]}
        />
      </Group>
      <Timeline active={active} bulletSize={24} lineWidth={2}>
        {stages.map((stage) => {
          const color = stage.status === 'done' ? 'green' : stage.status === 'held' ? 'orange' : stage.status === 'active' ? 'indigo' : 'gray'
          const label = stage.status === 'done' ? 'Done' : stage.status === 'skipped' ? 'Skipped' : stage.status === 'held' ? 'Needs attention' : stage.status === 'active' ? 'In progress' : 'Not yet'
          const actor = actorForStage(actors, stage.stageAction)
          const actual = whoDid?.[stage.key]
          const who = actual || (stage.stageAction
            ? actorDisplay(actor, { people, stageAction: stage.stageAction, assigneeName, hasAssignee })
            : undefined)
          const needsSomeone =
            !actual && Boolean(stage.stageAction) && actorNeedsAssignment(actor) && !who?.includes('assigned field worker')
          const items = media?.[stage.key] || []
          return (
            <Timeline.Item
              key={stage.key}
              bullet={stage.status === 'done' ? <IconCheck size={12} /> : stage.status === 'skipped' ? <IconMinus size={12} /> : stage.status === 'held' ? <IconAlertTriangle size={12} /> : stage.status === 'active' ? <IconClock size={12} /> : undefined}
              color={color}
              title={(
                <Group gap="xs">
                  <Text size="sm" fw={stage.status === 'active' ? 700 : 500}>{stage.label}</Text>
                  {stage.status === 'active' && <Badge size="xs" color="indigo">Current step</Badge>}
                </Group>
              )}
            >
              <Group gap="xs" mt={4} wrap="wrap">
                <Badge size="xs" color={color} variant="light">
                  {label}
                </Badge>
                {proofWords(stage.proof) && <Text size="xs" c="dimmed">{proofWords(stage.proof)}</Text>}
              </Group>
              {stage.note && <Text size="xs" c={stage.status === 'held' ? 'orange' : 'dimmed'} mt={4}>{stage.note}</Text>}
              {who && (
                <Group gap={6} mt={6} wrap="nowrap">
                  <IconUser size={14} />
                  <Text size="xs" c={needsSomeone ? 'orange' : 'dimmed'}>Who: {who}</Text>
                </Group>
              )}
              {stage.at && <Text size="xs" c="dimmed" mt={4}>{formatTxnTime(stage.at)}</Text>}
              <RelatedWorkLinks links={links?.[stage.key]} />
              {items.length > 0 && (
                <Group gap={6} mt={8} wrap="wrap">
                  {items.map((item, index) => (
                    <UnstyledButton key={`${stage.key}-${index}`} onClick={() => setPreview(item)} aria-label={`Open ${item.label}`}>
                      <Stack gap={2} align="center" maw={72}>
                        {item.src && !item.record ? (
                          <Image src={item.src} w={48} h={48} radius="sm" fit="cover" alt={item.label} />
                        ) : (
                          <Paper withBorder radius="sm" w={48} h={48} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <IconFileText size={20} />
                          </Paper>
                        )}
                        <Text size="xs" c="dimmed" ta="center" lineClamp={2}>{item.label}</Text>
                      </Stack>
                    </UnstyledButton>
                  ))}
                </Group>
              )}
            </Timeline.Item>
          )
        })}
      </Timeline>
      <Modal opened={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.label} size="lg" centered>
        <Stack gap="sm">
          {preview?.src && <Image src={preview.src} alt={preview.label} fit="contain" mah="70vh" />}
          {preview?.lines?.map((line) => <Text key={line} size="sm">{line}</Text>)}
          {!preview?.src && !preview?.lines?.length && <Text size="sm" c="dimmed">Nothing else was recorded for this.</Text>}
        </Stack>
      </Modal>
    </>
  )
}
