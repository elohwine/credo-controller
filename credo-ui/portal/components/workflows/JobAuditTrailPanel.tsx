import React from 'react';
import dayjs from 'dayjs';
import { Alert, Badge, Box, Card, Divider, Group, Image, Stack, Text, ThemeIcon, Timeline } from '@mantine/core';
import { IconCheck, IconClock, IconHandStop, IconMinus, IconPlayerPlay, IconUser } from '@tabler/icons-react';
import type { AuditStep, JobAuditTrail } from '@/components/finance/jobAuditTrail';

/**
 * Full history of one field job: who did each step, when, with what proof, plus the
 * records issued and any holds. Same layout on the portal job drawer and the app job
 * sheet (`credo-ui/mobile/components/shared/JobAuditTrailPanel.tsx`).
 */

const STATUS_WORDS: Record<AuditStep['status'], { label: string; color: string }> = {
    done: { label: 'Done', color: 'green' },
    active: { label: 'Waiting', color: 'blue' },
    pending: { label: 'Not yet', color: 'gray' },
    held: { label: 'On hold', color: 'orange' },
    skipped: { label: 'Not needed', color: 'gray' },
};

function when(value?: string): string {
    if (!value) return '';
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('D MMM YYYY HH:mm') : String(value);
}

function StepBullet({ status }: { status: AuditStep['status'] }) {
    if (status === 'done') return <IconCheck size={12} />;
    if (status === 'active') return <IconPlayerPlay size={12} />;
    if (status === 'held') return <IconHandStop size={12} />;
    if (status === 'skipped') return <IconMinus size={12} />;
    return <IconClock size={12} />;
}

export default function JobAuditTrailPanel({ trail, compact = false }: { trail: JobAuditTrail; compact?: boolean }) {
    const doneCount = trail.steps.filter((s) => s.status === 'done').length;
    const openHolds = trail.holds.filter((h) => !h.cleared);
    const thumb = compact ? 48 : 64;

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start">
                <Box>
                    <Text fw={600}>{trail.title}</Text>
                    <Text size="xs" c="dimmed">Job {trail.reference} · {doneCount} of {trail.steps.length} steps done</Text>
                </Box>
                <Badge variant="light" color={trail.status === 'completed' ? 'green' : trail.status === 'failed' ? 'red' : 'blue'}>
                    {trail.status === 'completed' ? 'Closed' : trail.status === 'failed' ? 'Stopped' : 'Open'}
                </Badge>
            </Group>

            {openHolds.length > 0 && (
                <Alert color="orange" variant="light" title="This job is on hold">
                    {openHolds.map((hold, idx) => (
                        <Text key={idx} size="sm">{hold.label}: {hold.reason}{hold.by ? ` — ${hold.by}` : ''}{hold.at ? `, ${when(hold.at)}` : ''}</Text>
                    ))}
                </Alert>
            )}

            <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                <Text fw={600} size="sm" mb="xs">People on this job</Text>
                {trail.people.length === 0 ? (
                    <Text size="sm" c="dimmed">Nobody has acted on this job yet.</Text>
                ) : (
                    <Stack gap="xs">
                        {trail.people.map((person) => (
                            <Group key={person.userId || person.name} align="flex-start" wrap="nowrap" gap="sm">
                                <ThemeIcon variant="light" color="gray" radius="xl" size="md"><IconUser size={14} /></ThemeIcon>
                                <Box style={{ flex: 1 }}>
                                    <Group gap={6}>
                                        <Text size="sm" fw={600}>{person.name}</Text>
                                        {person.role && <Badge size="xs" variant="light" color="gray">{person.role}</Badge>}
                                    </Group>
                                    <Text size="xs" c="dimmed">{person.did.join(' · ')}</Text>
                                    {(person.firstAt || person.lastAt) && (
                                        <Text size="xs" c="dimmed">
                                            {person.firstAt && person.lastAt && person.firstAt !== person.lastAt
                                                ? `${when(person.firstAt)} → ${when(person.lastAt)}`
                                                : when(person.lastAt || person.firstAt)}
                                        </Text>
                                    )}
                                </Box>
                            </Group>
                        ))}
                    </Stack>
                )}
            </Card>

            <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                <Text fw={600} size="sm" mb="sm">Step by step</Text>
                <Timeline bulletSize={22} lineWidth={2} active={Math.max(doneCount - 1, 0)} color="green">
                    {trail.steps.map((step) => {
                        const status = STATUS_WORDS[step.status];
                        return (
                            <Timeline.Item
                                key={step.id}
                                bullet={<StepBullet status={step.status} />}
                                color={status.color}
                                title={(
                                    <Group gap={6} wrap="nowrap" justify="space-between">
                                        <Text size="sm" fw={600}>{step.title}</Text>
                                        <Badge size="xs" variant="light" color={status.color}>{status.label}</Badge>
                                    </Group>
                                )}
                            >
                                {(step.by || step.at) && (
                                    <Text size="xs" c="dimmed">
                                        {step.by ? `By ${step.by}` : ''}{step.by && step.at ? ' · ' : ''}{step.at ? when(step.at) : ''}
                                    </Text>
                                )}
                                {step.deviceAt && step.at && dayjs(step.deviceAt).format('HH:mm') !== dayjs(step.at).format('HH:mm') && (
                                    <Text size="xs" c="dimmed">Taken on the phone at {when(step.deviceAt)}</Text>
                                )}
                                {step.proof && <Text size="xs" c="dimmed">{step.proof}{step.ref ? ` · ref ${step.ref}` : ''}</Text>}
                                {!step.proof && step.ref && <Text size="xs" c="dimmed">Ref {step.ref}</Text>}
                                {step.details.map((line, idx) => (
                                    <Text key={idx} size="xs">{line}</Text>
                                ))}
                                {step.photos.length > 0 && (
                                    <Group gap={6} mt={6} wrap="wrap">
                                        {step.photos.slice(0, 6).map((uri, idx) => (
                                            <Image key={idx} src={uri} alt={`${step.title} ${idx + 1}`} w={thumb} h={thumb} radius="sm" fit="cover" />
                                        ))}
                                        {step.photos.length > 6 && <Text size="xs" c="dimmed">+{step.photos.length - 6} more</Text>}
                                    </Group>
                                )}
                            </Timeline.Item>
                        );
                    })}
                </Timeline>
            </Card>

            <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                <Text fw={600} size="sm" mb="xs">Records issued</Text>
                {trail.records.length === 0 ? (
                    <Text size="sm" c="dimmed">No records issued yet.</Text>
                ) : (
                    <Stack gap={6}>
                        {trail.records.map((record) => (
                            <Group key={record.type} justify="space-between" align="flex-start" wrap="nowrap">
                                <Box>
                                    <Text size="sm">{record.label}</Text>
                                    <Text size="xs" c="dimmed">
                                        {record.to ? `Sent to ${record.to}` : 'Sent to the chosen person'}{record.stage ? ` · ${record.stage}` : ''}
                                    </Text>
                                </Box>
                                <Text size="xs" c="dimmed">{when(record.issuedAt)}</Text>
                            </Group>
                        ))}
                    </Stack>
                )}
            </Card>

            {trail.holds.length > 0 && (
                <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                    <Text fw={600} size="sm" mb="xs">Holds</Text>
                    <Stack gap={6}>
                        {trail.holds.map((hold, idx) => (
                            <Box key={idx}>
                                <Group gap={6}>
                                    <Text size="sm">{hold.label}</Text>
                                    <Badge size="xs" variant="light" color={hold.cleared ? 'gray' : 'orange'}>{hold.cleared ? 'Cleared' : 'Open'}</Badge>
                                </Group>
                                <Text size="xs" c="dimmed">{hold.reason}{hold.by ? ` — ${hold.by}` : ''}{hold.at ? `, ${when(hold.at)}` : ''}</Text>
                            </Box>
                        ))}
                    </Stack>
                </Card>
            )}

            {trail.stageChanges.length > 0 && (
                <>
                    <Divider label="Stage changes" labelPosition="left" />
                    <Stack gap={4}>
                        {trail.stageChanges.map((change, idx) => (
                            <Group key={`${change.stage}-${idx}`} justify="space-between" wrap="nowrap">
                                <Text size="xs">{change.label}{change.by ? ` · ${change.by}` : ''}</Text>
                                <Text size="xs" c="dimmed">{when(change.at)}</Text>
                            </Group>
                        ))}
                    </Stack>
                </>
            )}
        </Stack>
    );
}
