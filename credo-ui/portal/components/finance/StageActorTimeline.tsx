import React, { useState } from 'react'
import { Badge, Group, Image, Modal, Paper, Stack, Text, Timeline, UnstyledButton } from '@mantine/core'

import { StepHelp } from '@/components/help/StepHelp'
import { IconAlertTriangle, IconCheck, IconClock, IconFileText, IconMinus, IconUser } from '@tabler/icons-react'

import {
  actorDisplay,
  actorNeedsAssignment,
  actorForStage,
  proofWords,
  type FinanceStageView,
  type StagePerson,
  type WorkflowActorStage,
} from './financeStages'
import type { StageMediaItem } from './jobAuditTrail'
import { formatTxnTime } from '@/lib/inboxAttention'
import { RelatedWorkLinks } from '@/components/workflows/JobHandoffsPanel'
import type { RelatedWorkLink } from '../../../shared/relatedWork'

/**
 * Step timeline in customer words: what the step is, whether it is done, how it is confirmed,
 * and who does it (by name). Internal credential and protocol names never appear here.
 */
export function StageActorTimeline({
  stages,
  actors,
  people,
  assigneeName,
  whoDid,
  media,
  links,
  title = 'Progress',
  help,
}: {
  stages: FinanceStageView[]
  /** Header above the steps. Pass a count ("Progress (2 of 5 steps done)") when the page has one. */
  title?: string
  help?: { title: string; points: string[] }
  actors?: WorkflowActorStage[]
  /** Team members, so steps show a person's name instead of an ID. */
  people?: StagePerson[]
  /** The assigned field worker, used for the steps they do on their phone. */
  assigneeName?: string
  /**
   * Who actually did (or, for sign-off, who this job chose for) each stage, by stage key —
   * see `whoDidStages` in jobAuditTrail. Wins over the organization's default table.
   */
  whoDid?: Record<string, string>
  /** Photos and attached records per stage key — see `stageMedia` in jobAuditTrail. */
  media?: Record<string, StageMediaItem[]>
  links?: Record<string, RelatedWorkLink[]>
}) {
  // A finished job has no "current" step. Colour every stage that has been reached,
  // so a green tick shows on each done stage, not only the first.
  const timelineActive = stages.reduce((last, stage, index) => (stage.status === 'pending' ? last : index), -1)
  const [preview, setPreview] = useState<StageMediaItem | null>(null)

  return (
    <>
      <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
        <Text fw={600}>{title}</Text>
        <StepHelp
          title={help?.title || title.replace(/\s*\(.*\)$/, '')}
          points={help?.points || [
            'Each step shows what happens and who does it.',
            'A step is marked done when that person finishes it.',
            'The person named for a step gets it in their inbox.',
            ...(media && Object.keys(media).length > 0 ? ['Photos and records on a step were taken for that step.'] : []),
          ]}
        />
      </Group>
      <Timeline active={timelineActive} bulletSize={24} lineWidth={2}>
        {stages.map((stage) => {
          const actor = actorForStage(actors, stage.stageAction)
          const isActive = stage.status === 'active'
          const color = stage.status === 'done' ? 'green' : stage.status === 'held' ? 'orange' : isActive ? 'indigo' : 'gray'
          const label = stage.status === 'done' ? 'Done' : stage.status === 'skipped' ? 'Skipped' : stage.status === 'held' ? 'Needs attention' : isActive ? 'In progress' : 'Not yet'
          const how = proofWords(stage.proof)
          const actual = whoDid?.[stage.key]
          const who = actual || (stage.stageAction ? actorDisplay(actor, { people, stageAction: stage.stageAction, assigneeName }) : undefined)
          const needsSomeone = !actual && Boolean(stage.stageAction) && actorNeedsAssignment(actor) && !who?.includes('(assigned field worker)')
          const items = media?.[stage.key] || []
          return (
            <Timeline.Item
              key={stage.key}
              bullet={stage.status === 'done' ? <IconCheck size={12} /> : stage.status === 'skipped' ? <IconMinus size={12} /> : stage.status === 'held' ? <IconAlertTriangle size={12} /> : isActive ? <IconClock size={12} /> : undefined}
              color={color}
              title={(
                <Group gap="xs">
                  <Text size="sm" fw={isActive ? 700 : 500}>{stage.label}</Text>
                  {isActive && <Badge size="xs" color="indigo">Current step</Badge>}
                </Group>
              )}
            >
              <Group gap="xs" mt={4} wrap="wrap">
                <Badge size="xs" color={color} variant="light">
                  {label}
                </Badge>
                {how && <Text size="xs" c="dimmed">{how}</Text>}
              </Group>
              {stage.note && <Text size="xs" c={stage.status === 'held' ? 'orange' : 'dimmed'} mt={4}>{stage.note}</Text>}
              {who && (
                <Group gap={6} mt={6} wrap="nowrap">
                  <IconUser size={14} />
                  <Text size="xs" c={needsSomeone ? 'orange' : 'dimmed'}>
                    Who: {who}
                  </Text>
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
      <Modal opened={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.label} size="lg" centered zIndex={1000}>
        <Stack gap="sm">
          {preview?.src && <Image src={preview.src} alt={preview.label} fit="contain" mah="70vh" />}
          {preview?.lines?.map((line) => (
            <Text key={line} size="sm">{line}</Text>
          ))}
          {!preview?.src && !preview?.lines?.length && (
            <Text size="sm" c="dimmed">Nothing else was recorded for this.</Text>
          )}
        </Stack>
      </Modal>
    </>
  )
}
