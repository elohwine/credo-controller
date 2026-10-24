import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Badge, Box, Button, Card, Divider, Group, Image, Modal, SegmentedControl, Stack, Table, Text, ThemeIcon, Timeline, UnstyledButton } from '@mantine/core';
import { IconCheck, IconChevronDown, IconClock, IconDownload, IconFileText, IconFileZip, IconHandStop, IconMinus, IconPlayerPlay, IconUser } from '@tabler/icons-react';
import { auditTableRows, closeoutSummary, type AuditStep, type JobAuditTrail, type StageMediaItem } from '@/lib/jobAuditTrail';
import { safetyHoldStateWords } from '@/lib/uxCopy';
import { RelatedWorkLinks } from './JobHandoffsPanel';
import { canExportReports, csvFrom, EXPORT_MIME, exportFileName, saveBinaryExport, saveExport } from '@/lib/exportFile';
import { buildEvidencePack, bytesToBase64, evidencePhotos, photoFile } from '@/lib/evidencePack';

/**
 * Full history of one field job: who did each step, when, with what proof, plus the
 * records issued and any holds. Same layout on the portal job drawer and the app job
 * sheet (`credo-ui/portal/components/workflows/JobAuditTrailPanel.tsx`).
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

const AUDIT_HEADERS = ['Step', 'Date and time', 'Status', 'Person', 'Evidence and records', 'Confirmation', 'Details'];

function StepBullet({ status }: { status: AuditStep['status'] }) {
    if (status === 'done') return <IconCheck size={12} />;
    if (status === 'active') return <IconPlayerPlay size={12} />;
    if (status === 'held') return <IconHandStop size={12} />;
    if (status === 'skipped') return <IconMinus size={12} />;
    return <IconClock size={12} />;
}

/** The step that produced each issued record, so opening the record shows that step's picture and facts. */
const STEP_FOR_RECORD: Record<string, string> = {
    RequisitionVC: 'assigned',
    SiteInspectionVC: 'site_inspection',
    ReceiptVC: 'receipt',
    ExecutionAckVC: 'signoff',
    InvoiceVC: 'client_invoice',
    PaymentReceiptVC: 'receipt_issued',
};

function stageLines(step: AuditStep, extra: string[] = []): string[] {
    const seen = new Set<string>();
    const lines: string[] = [];
    const raw = [
        ...extra,
        step.by ? `By ${step.by}` : '',
        step.at ? when(step.at) : '',
        step.deviceAt && step.at && dayjs(step.deviceAt).format('HH:mm') !== dayjs(step.at).format('HH:mm')
            ? `Taken on the phone at ${when(step.deviceAt)}`
            : '',
        step.proof ? `${step.proof}${step.ref ? ` · ref ${step.ref}` : ''}` : (step.ref ? `Ref ${step.ref}` : ''),
        ...step.details,
    ];
    for (const line of raw) {
        const text = String(line || '').trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        lines.push(text);
    }
    return lines;
}

export default function JobAuditTrailPanel({ trail, compact = false, embedded = false, subject = 'job' }: { trail: JobAuditTrail; compact?: boolean; embedded?: boolean; /** What the history is about, in plain words: "job" or "request". */ subject?: 'job' | 'request' }) {
    const closeout = closeoutSummary(trail);
    const openHolds = trail.holds.filter((h) => !h.cleared);
    const thumb = compact ? 48 : 64;
    const [openId, setOpenId] = useState<string | null>(null);
    const [preview, setPreview] = useState<StageMediaItem | null>(null);
    const [view, setView] = useState<'timeline' | 'table'>('timeline');
    const [canExport, setCanExport] = useState(false);
    const tableRows = auditTableRows(trail);

    useEffect(() => { setCanExport(canExportReports()); }, []);

    const [fileBusy, setFileBusy] = useState<'photo' | 'pack' | null>(null);
    const [fileNote, setFileNote] = useState<{ color: 'red' | 'dimmed'; text: string } | null>(null);
    const photoCount = evidencePhotos(trail).length;

    const auditRows = () => tableRows.map((row) => ({
            step: row.event,
            at: when(row.at),
            status: STATUS_WORDS[row.status].label,
            person: row.person || '',
            evidence: row.evidence.map((item) => item.label).join('; '),
            confirmation: row.confirmation || '',
            details: row.details.join('; '),
        }));
    const auditCsv = () => csvFrom(AUDIT_HEADERS, auditRows().map((row) => [row.step, row.at, row.status, row.person, row.evidence, row.confirmation, row.details]));

    const downloadAudit = (format: 'csv' | 'json') => {
        const rows = auditRows();
        const name = exportFileName(`${trail.reference || 'job'}-audit`, format);
        const body = format === 'csv' ? auditCsv() : JSON.stringify(rows, null, 2);
        void saveExport(name, EXPORT_MIME[format], body);
    };

    const downloadPhoto = async (item: StageMediaItem) => {
        if (!item.src || fileBusy) return;
        setFileBusy('photo');
        setFileNote(null);
        try {
            const file = await photoFile(item.src);
            const name = exportFileName(`${trail.reference || 'job'}-${item.label}`, file.extension);
            await saveBinaryExport(name, file.mime, file.bytes, () => bytesToBase64(file.bytes));
        } catch (error: any) {
            setFileNote({ color: 'red', text: error?.message || 'The photo could not be downloaded.' });
        } finally {
            setFileBusy(null);
        }
    };

    const downloadEvidencePack = async () => {
        if (fileBusy) return;
        setFileBusy('pack');
        setFileNote(null);
        try {
            const pack = await buildEvidencePack(trail, auditCsv());
            const name = exportFileName(`${trail.reference || 'job'}-evidence`, 'zip');
            await saveBinaryExport(name, EXPORT_MIME.zip, pack.bytes, () => bytesToBase64(pack.bytes));
            setFileNote(pack.missing.length
                ? { color: 'red', text: `Saved ${pack.photoCount} photos. Could not load: ${pack.missing.join(', ')}.` }
                : { color: 'dimmed', text: `Evidence pack saved: ${pack.photoCount} photos, audit table and photo list.` });
        } catch (error: any) {
            setFileNote({ color: 'red', text: error?.message || 'The evidence pack could not be made.' });
        } finally {
            setFileBusy(null);
        }
    };

    const openPreview = (item: StageMediaItem, _kind: 'photo' | 'record') => {
        setPreview(item);
    };

    const toggleStep = (step: AuditStep) => {
        const opening = openId !== step.id;
        setOpenId(opening ? step.id : null);
    };

    return (
        <Stack gap="md">
            {!embedded && <Group justify="space-between" align="flex-start">
                <Box>
                    <Text fw={600}>{trail.title}</Text>
                    <Text size="xs" c="dimmed">{subject === 'request' ? 'Request' : 'Job'} {trail.reference} · {closeout.settled} of {closeout.total} steps done or not needed</Text>
                    {subject === 'job' && closeout.stillOpen.length > 0 && trail.status !== 'failed' && (
                        <Text size="xs" c="dimmed">Still to do: {closeout.stillOpen.join(', ')}</Text>
                    )}
                </Box>
                <Badge variant="light" color={trail.status === 'completed' ? 'green' : trail.status === 'failed' ? 'red' : 'blue'}>
                    {trail.status === 'completed' ? 'Closed' : trail.status === 'failed' ? 'Stopped' : 'Open'}
                </Badge>
            </Group>}

            {openHolds.length > 0 && (
                <Alert color="orange" variant="light" title="This job is on hold">
                    {openHolds.map((hold, idx) => (
                        <Text key={hold.id || idx} size="sm">
                            {hold.label}: {hold.reason}{hold.by ? ` — ${hold.by}` : ''}{hold.at ? `, ${when(hold.at)}` : ''}
                            {' '}{safetyHoldStateWords(hold.status, 'org', { by: hold.by, resolvedBy: hold.resolvedBy, fixBy: hold.fixBy }).line}
                        </Text>
                    ))}
                </Alert>
            )}

            <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                <Text fw={600} size="sm" mb="xs">People on this {subject}</Text>
                {trail.people.length === 0 ? (
                    <Text size="sm" c="dimmed">Nobody has acted on this {subject} yet.</Text>
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
                <Group justify="space-between" mb="sm">
                    <Text fw={600} size="sm">{view === 'timeline' ? 'Step by step' : 'Audit table'}</Text>
                    <Group gap="xs">
                        {canExport && <Button size="xs" variant="default" onClick={() => downloadAudit('csv')}>Export CSV</Button>}
                        {canExport && <Button size="xs" variant="default" onClick={() => downloadAudit('json')}>Export JSON</Button>}
                        {canExport && photoCount > 0 && (
                            <Button size="xs" variant="default" leftSection={<IconFileZip size={14} />} loading={fileBusy === 'pack'} disabled={fileBusy === 'photo'} onClick={() => void downloadEvidencePack()}>
                                Evidence pack
                            </Button>
                        )}
                        <SegmentedControl
                            size="xs"
                            value={view}
                            onChange={(value) => setView(value as 'timeline' | 'table')}
                            data={[{ value: 'timeline', label: 'Timeline' }, { value: 'table', label: 'Table' }]}
                        />
                    </Group>
                </Group>
                {fileNote && <Text size="xs" c={fileNote.color} mb="xs">{fileNote.text}</Text>}
                {view === 'timeline' ? (
                <Timeline bulletSize={22} lineWidth={2} active={trail.steps.reduce((last, step, index) => (step.status === 'pending' ? last : index), -1)} color="green">
                    {trail.steps.map((step) => {
                        const status = STATUS_WORDS[step.status];
                        return (
                            <Timeline.Item
                                key={step.id}
                                bullet={<StepBullet status={step.status} />}
                                color={status.color}
                                title={(
                                    <UnstyledButton onClick={() => toggleStep(step)} aria-expanded={openId === step.id} style={{ width: '100%' }}>
                                        <Group gap={6} wrap="nowrap" justify="space-between">
                                            <Text size="sm" fw={600}>{step.title}</Text>
                                            <Group gap={6} wrap="nowrap">
                                                <Badge size="xs" variant="light" color={status.color}>{status.label}</Badge>
                                                <IconChevronDown size={14} style={{ transform: openId === step.id ? 'rotate(180deg)' : undefined }} />
                                            </Group>
                                        </Group>
                                    </UnstyledButton>
                                )}
                            >
                                {(step.by || step.at) && (
                                    <Text size="xs" c="dimmed">
                                        {step.by ? `By ${step.by}` : ''}{step.by && step.at ? ' · ' : ''}{step.at ? when(step.at) : ''}
                                    </Text>
                                )}
                                <RelatedWorkLinks links={step.related} />
                                {openId === step.id && (
                                    <>
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
                                                {step.photos.map((uri, idx) => (
                                                    <UnstyledButton
                                                        key={idx}
                                                        aria-label={`Open ${step.title} ${idx + 1}`}
                                                        onClick={() => openPreview({ src: uri, label: `${step.title} ${idx + 1}`, lines: stageLines(step) }, 'photo')}
                                                    >
                                                        <Image src={uri} alt={`${step.title} ${idx + 1}`} w={thumb} h={thumb} radius="sm" fit="cover" />
                                                    </UnstyledButton>
                                                ))}
                                            </Group>
                                        )}
                                        {(step.documents || []).map((label) => (
                                            <UnstyledButton
                                                key={label}
                                                mt={6}
                                                aria-label={`Open ${label}`}
                                                onClick={() => openPreview({ label, record: true, src: step.photos[0], lines: stageLines(step) }, 'record')}
                                            >
                                                <Group gap={6} wrap="nowrap">
                                                    <IconFileText size={16} />
                                                    <Text size="xs">{label}</Text>
                                                </Group>
                                            </UnstyledButton>
                                        ))}
                                    </>
                                )}
                            </Timeline.Item>
                        );
                    })}
                </Timeline>
                ) : (
                    <Table.ScrollContainer minWidth={640} type="native">
                        <Table striped highlightOnHover withTableBorder stickyHeader verticalSpacing="xs" horizontalSpacing="sm" fz="sm" captionSide="bottom">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--mantine-color-body)' }}>Step</Table.Th>
                                    <Table.Th>Date and time</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Person</Table.Th>
                                    <Table.Th>Evidence and records</Table.Th>
                                    <Table.Th>Confirmation</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {tableRows.map((row) => {
                                    const status = STATUS_WORDS[row.status];
                                    return (
                                        <Table.Tr key={row.id}>
                                            <Table.Td fw={600} style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1 }}>
                                                {row.event}
                                                {row.details.map((line, index) => <Text key={index} size="xs" fw={400}>{line}</Text>)}
                                                <RelatedWorkLinks links={trail.steps.find((step) => step.id === row.id)?.related} />
                                            </Table.Td>
                                            <Table.Td>{when(row.at) || '—'}</Table.Td>
                                            <Table.Td><Badge size="xs" variant="light" color={status.color}>{status.label}</Badge></Table.Td>
                                            <Table.Td>{row.person || '—'}</Table.Td>
                                            <Table.Td>
                                                {row.evidence.length === 0 ? '—' : (
                                                    <Group gap={6} wrap="nowrap">
                                                        {row.evidence.map((item, index) => (
                                                            <UnstyledButton key={`${row.id}-${index}`} aria-label={`Open ${item.label}`} onClick={() => openPreview(item, item.record ? 'record' : 'photo')}>
                                                                {item.src && !item.record
                                                                    ? <Image src={item.src} alt={item.label} w={36} h={36} radius="sm" fit="cover" />
                                                                    : <ThemeIcon variant="light" color="gray"><IconFileText size={16} /></ThemeIcon>}
                                                            </UnstyledButton>
                                                        ))}
                                                    </Group>
                                                )}
                                            </Table.Td>
                                            <Table.Td>{row.confirmation || '—'}</Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                            <Table.Caption>{tableRows.length} {tableRows.length === 1 ? 'step' : 'steps'}</Table.Caption>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Card>

            <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                <Text fw={600} size="sm" mb="xs">Records issued</Text>
                {trail.records.length === 0 ? (
                    <Text size="sm" c="dimmed">No records issued yet.</Text>
                ) : (
                    <Stack gap={6}>
                        {trail.records.map((record) => {
                            const step = trail.steps.find((item) => item.id === STEP_FOR_RECORD[record.type]);
                            const sent = [record.to ? `Sent to ${record.to}` : 'Sent to the chosen person', record.stage || ''].filter(Boolean).join(' · ');
                            return (
                                <UnstyledButton
                                    key={record.type}
                                    aria-label={`Open ${record.label}`}
                                    onClick={() => openPreview({
                                        label: record.label,
                                        record: true,
                                        src: step?.photos[0],
                                        lines: stageLines(step || { id: record.type, title: record.label, status: 'done', details: [], photos: [] }, [
                                            sent,
                                            record.issuedAt ? when(record.issuedAt) : '',
                                        ]),
                                    }, 'record')}
                                >
                                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                                        <Group gap={6} wrap="nowrap" align="flex-start">
                                            <IconFileText size={16} />
                                            <Box>
                                                <Text size="sm">{record.label}</Text>
                                                <Text size="xs" c="dimmed">{sent}</Text>
                                            </Box>
                                        </Group>
                                        <Text size="xs" c="dimmed">{when(record.issuedAt)}</Text>
                                    </Group>
                                </UnstyledButton>
                            );
                        })}
                    </Stack>
                )}
            </Card>

            {trail.holds.length > 0 && (
                <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
                    <Text fw={600} size="sm" mb="xs">Holds</Text>
                    <Stack gap="sm">
                        {trail.holds.map((hold, idx) => {
                            const words = safetyHoldStateWords(hold.status, 'org', { by: hold.by, resolvedBy: hold.resolvedBy, fixBy: hold.fixBy });
                            return (
                                <Group key={hold.id || idx} align="flex-start" wrap="nowrap" gap="sm">
                                    {hold.photo && (
                                        <UnstyledButton
                                            aria-label={`Open ${hold.label}`}
                                            onClick={() => openPreview({
                                                src: hold.photo,
                                                label: hold.label,
                                                lines: [
                                                    hold.reason,
                                                    hold.by ? `Raised by ${hold.by}` : '',
                                                    hold.at ? when(hold.at) : '',
                                                    hold.resolutionNote ? `What was done: ${hold.resolutionNote}` : '',
                                                    hold.whatChanged ? `What changed: ${hold.whatChanged}` : '',
                                                ].map((line) => line.trim()).filter(Boolean),
                                            }, 'photo')}
                                        >
                                            <Image src={hold.photo} alt={`${hold.label} hold photo`} w={thumb} h={thumb} radius="sm" fit="cover" />
                                        </UnstyledButton>
                                    )}
                                    <Box style={{ flex: 1 }}>
                                        <Group gap={6}>
                                            <Text size="sm">{hold.label}</Text>
                                            <Badge size="xs" variant="light" color={words.color}>{words.label}</Badge>
                                        </Group>
                                        <Text size="xs">{hold.reason}</Text>
                                        <Text size="xs" c="dimmed">{hold.by ? `Raised by ${hold.by}` : 'Raised'}{hold.at ? `, ${when(hold.at)}` : ''}</Text>
                                        {hold.resolutionNote && (
                                            <Text size="xs" c="dimmed">Sorted{hold.resolvedBy ? ` by ${hold.resolvedBy}` : ''}{hold.resolvedAt ? `, ${when(hold.resolvedAt)}` : ''}: {hold.resolutionNote}</Text>
                                        )}
                                        {hold.whatChanged && <Text size="xs" c="dimmed">What changed: {hold.whatChanged}</Text>}
                                        {hold.status !== 'cleared' && <Text size="xs" c="dimmed">{words.line}</Text>}
                                    </Box>
                                </Group>
                            );
                        })}
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
            <Modal opened={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.label} size="lg" centered>
                <Stack gap="sm">
                    {preview?.src && <Image src={preview.src} alt={preview.label} fit="contain" mah="70vh" />}
                    {preview?.src && (
                        <Group justify="flex-end">
                            <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} loading={fileBusy === 'photo'} disabled={fileBusy === 'pack'} onClick={() => void downloadPhoto(preview)}>
                                Download photo
                            </Button>
                        </Group>
                    )}
                    {preview?.lines?.map((line) => (
                        <Text key={line} size="sm">{line}</Text>
                    ))}
                    {!preview?.src && !preview?.lines?.length && (
                        <Text size="sm" c="dimmed">Nothing else was recorded for this.</Text>
                    )}
                </Stack>
            </Modal>
        </Stack>
    );
}
