import React from 'react'
import { Badge, Group, Text, Timeline } from '@mantine/core'
import { IconCheck, IconClock, IconUser } from '@tabler/icons-react'

import {
  actorDisplay,
  actorNeedsAssignment,
  actorForStage,
  proofWords,
  type FinanceStageView,
  type StagePerson,
  type WorkflowActorStage,
} from './financeStages'

/**
 * Step timeline in customer words: what the step is, whether it is done, how it is confirmed,
 * and who does it (by name). Internal credential and protocol names never appear here.
 */
export function StageActorTimeline({
  stages,
  actors,
  people,
  assigneeName,
}: {
  stages: FinanceStageView[]
  actors?: WorkflowActorStage[]
  /** Team members, so steps show a person's name instead of an ID. */
  people?: StagePerson[]
  /** The assigned field worker, used for the steps they do on their phone. */
  assigneeName?: string
}) {
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.status === 'active'))

  return (
    <Timeline active={activeIndex} bulletSize={24} lineWidth={2}>
      {stages.map((stage) => {
        const actor = actorForStage(actors, stage.stageAction)
        const isActive = stage.status === 'active'
        const how = proofWords(stage.proof)
        const who = stage.stageAction ? actorDisplay(actor, { people, stageAction: stage.stageAction, assigneeName }) : undefined
        const needsSomeone = Boolean(stage.stageAction) && actorNeedsAssignment(actor) && !who?.includes('(assigned field worker)')
        return (
          <Timeline.Item
            key={stage.key}
            bullet={stage.status === 'done' ? <IconCheck size={12} /> : isActive ? <IconClock size={12} /> : undefined}
            color={stage.status === 'done' ? 'teal' : isActive ? 'indigo' : 'gray'}
            title={(
              <Group gap="xs">
                <Text size="sm" fw={isActive ? 700 : 500}>{stage.label}</Text>
                {isActive && <Badge size="xs" color="indigo">Current step</Badge>}
              </Group>
            )}
          >
            <Group gap="xs" mt={4} wrap="wrap">
              <Badge size="xs" color={stage.status === 'done' ? 'green' : isActive ? 'blue' : 'gray'} variant="light">
                {stage.status === 'done' ? 'Done' : isActive ? 'In progress' : 'Not yet'}
              </Badge>
              {how && <Text size="xs" c="dimmed">{how}</Text>}
            </Group>
            {who && (
              <Group gap={6} mt={6} wrap="nowrap">
                <IconUser size={14} />
                <Text size="xs" c={needsSomeone ? 'orange' : 'dimmed'}>
                  Who: {who}
                </Text>
              </Group>
            )}
          </Timeline.Item>
        )
      })}
    </Timeline>
  )
}
