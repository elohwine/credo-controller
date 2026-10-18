import React, { useState } from 'react';
import { Alert, Button, Card, Checkbox, Group, Image, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fieldEvidenceResumePayload, type EvidencePhase, type FieldEvidencePayload } from '../../../shared/fieldEvidence';
import { validateCheckpointPayload } from '../../../../src/services/workflow/actions/fieldCheckpoints';
import { SAFETY_HOLD_COPY } from '../finance/financeStages';
import { holdWaitsForOrganisation, purchaseReceiptLine, type AuditHold, type PurchaseReceipt } from '../finance/jobAuditTrail';
import LiveJobPhoto, { readJobLocation } from './LiveJobPhoto';

export default function WorkerJobSteps({ pauseReason, canWork, held, safetyHold, purchaseReceipts, resume, onRefresh }: {
    pauseReason: string;
    canWork: boolean;
    held: boolean;
    safetyHold?: AuditHold;
    purchaseReceipts: PurchaseReceipt[];
    resume: (payload: Record<string, unknown>) => Promise<void>;
    onRefresh: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [siteCode, setSiteCode] = useState('');
    const [decision, setDecision] = useState<string | null>(null);
    const [hazards, setHazards] = useState('');
    const [controls, setControls] = useState('');
    const [ppe, setPpe] = useState(false);
    const [reason, setReason] = useState('');
    const [fixBy, setFixBy] = useState<string | null>('organisation');
    const [whatChanged, setWhatChanged] = useState('');
    const [holdPhoto, setHoldPhoto] = useState<FieldEvidencePayload | null>(null);
    const [photos, setPhotos] = useState<FieldEvidencePayload[]>([]);
    const [notes, setNotes] = useState('');
    const [finished, setFinished] = useState(false);
    const phase: EvidencePhase | undefined = pauseReason === 'await_evidence_before' ? 'before'
        : pauseReason === 'await_evidence_after' ? 'after'
            : pauseReason === 'await_evidence_receipt' ? 'receipt' : undefined;
    const isWorkerStep = ['await_worker_start', 'await_arrival', 'await_risk_assessment'].includes(pauseReason) || Boolean(phase);
    if (!isWorkerStep) return null;
    if (!canWork) return <Text size="sm" c="dimmed">The assigned worker continues this step from the portal or mobile app.</Text>;

    const save = async (payload: () => Promise<Record<string, unknown>>, isHold = false) => {
        setBusy(true);
        setError('');
        try {
            await resume(await payload());
            notifications.show({ title: 'Step saved', message: 'This step is now on the job.', color: 'green' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not save this step.';
            if (isHold && /on hold/i.test(message)) {
                notifications.show({ title: SAFETY_HOLD_COPY.savedTitle, message: SAFETY_HOLD_COPY.savedMessage, color: 'orange' });
            } else setError(message);
        } finally {
            onRefresh();
            setBusy(false);
        }
    };

    const saveSafety = () => save(async () => {
        const riskAssessment = {
            decision,
            hazards: hazards.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
            controls: controls.trim(),
            ppeConfirmed: ppe,
            safeToProceed: decision === 'safe',
            holdReason: reason.trim(),
            holdPhoto: holdPhoto ? {
                photoUri: `data:${holdPhoto.mimeType};base64,${holdPhoto.imageBase64}`,
                evidenceHash: holdPhoto.sha256,
            } : undefined,
            fixBy,
            whatChanged: whatChanged.trim(),
        };
        const check = validateCheckpointPayload('risk_assessment', riskAssessment, {
            riskAssessment: { openHold: Boolean(safetyHold), waitingForOrganisation: holdWaitsForOrganisation(safetyHold) },
        });
        if (!check.ok && !check.blocked) throw new Error(check.error);
        return { riskAssessment };
    }, decision === 'not_safe');

    return <Card withBorder radius="md">
        <Stack gap="sm">
            {held && <Alert color="orange">This job is waiting for related work. Its next step is held.</Alert>}
            {error && <Alert color="red">{error}</Alert>}
            {pauseReason === 'await_worker_start' && <>
                <Text fw={600}>Start your assigned job</Text>
                <Button loading={busy} disabled={held} onClick={() => void save(async () => ({}))}>Start job</Button>
            </>}
            {pauseReason === 'await_arrival' && <>
                <Text fw={600}>Confirm arrival</Text>
                <Text size="sm" c="dimmed">Share this device's location to confirm you are on site, or enter the site code.</Text>
                <TextInput label="Site code (optional)" value={siteCode} onChange={(event) => setSiteCode(event.currentTarget.value)} />
                <Button loading={busy} disabled={held} onClick={() => void save(async () => ({
                    arrival: siteCode.trim() ? { qrToken: siteCode.trim() } : { gps: await readJobLocation() },
                }))}>Share location &amp; confirm</Button>
            </>}
            {pauseReason === 'await_risk_assessment' && <>
                <Text fw={600}>Do the safety check</Text>
                <Text size="sm" c="dimmed">The worker makes this call on site. If it is not safe, hold the job and tell the organisation.</Text>
                {safetyHold && <Alert color="orange">
                    <Text size="sm">{safetyHold.reason}</Text>
                    {safetyHold.resolutionNote && <Text size="sm">What was done: {safetyHold.resolutionNote}</Text>}
                    {holdWaitsForOrganisation(safetyHold) && <Text size="sm">{SAFETY_HOLD_COPY.waitingHelp}</Text>}
                </Alert>}
                <Textarea label={SAFETY_HOLD_COPY.hazardsLabel} value={hazards} onChange={(event) => setHazards(event.currentTarget.value)} />
                <Select label="Is it safe to start?" value={decision} onChange={setDecision} data={[
                    { value: 'safe', label: SAFETY_HOLD_COPY.choiceSafe },
                    { value: 'not_safe', label: SAFETY_HOLD_COPY.choiceNotSafe },
                ]} />
                {decision === 'safe' && <>
                    <Textarea label="How the hazards are controlled" value={controls} onChange={(event) => setControls(event.currentTarget.value)} />
                    <Checkbox label="I have the protective equipment this job needs" checked={ppe} onChange={(event) => setPpe(event.currentTarget.checked)} />
                    {safetyHold && <Textarea required label={SAFETY_HOLD_COPY.whatChangedLabel} value={whatChanged} onChange={(event) => setWhatChanged(event.currentTarget.value)} />}
                </>}
                {decision === 'not_safe' && <>
                    <Textarea required label={SAFETY_HOLD_COPY.reasonLabel} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
                    <Select label={SAFETY_HOLD_COPY.fixByLabel} value={fixBy} onChange={setFixBy} data={[
                        { value: 'organisation', label: SAFETY_HOLD_COPY.fixByOrganisation },
                        { value: 'worker', label: SAFETY_HOLD_COPY.fixByWorker },
                    ]} />
                    {holdPhoto && <Image src={`data:${holdPhoto.mimeType};base64,${holdPhoto.imageBase64}`} alt="What made the job unsafe" h={140} fit="contain" />}
                    <LiveJobPhoto requireLocation={false} onCapture={setHoldPhoto} />
                </>}
                <Button color={decision === 'not_safe' ? 'orange' : 'green'} loading={busy}
                    disabled={held || !decision || (decision === 'safe' && holdWaitsForOrganisation(safetyHold))}
                    onClick={() => void saveSafety()}>
                    {decision === 'not_safe' ? SAFETY_HOLD_COPY.submitHold : SAFETY_HOLD_COPY.submitSafe}
                </Button>
            </>}
            {phase && <>
                <Text fw={600}>{phase === 'before' ? 'Before photos' : phase === 'after' ? 'After photos (work done)' : 'Receipts for materials'}</Text>
                {phase === 'after' && <Checkbox label="Yes, the work is finished" checked={finished} onChange={(event) => setFinished(event.currentTarget.checked)} />}
                {(phase !== 'after' || finished) && <>
                    <Group>
                        {photos.map((photo, index) => <Stack key={`${photo.timestamp}-${index}`} gap={4}>
                            <Image src={`data:${photo.mimeType};base64,${photo.imageBase64}`} alt={`Live photo ${index + 1}`} w={100} h={80} fit="cover" />
                            <Button size="xs" variant="subtle" disabled={busy} onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}>Remove photo {index + 1}</Button>
                        </Stack>)}
                    </Group>
                    <LiveJobPhoto requireLocation={phase !== 'receipt'} onCapture={(photo) => setPhotos((current) => [...current, photo])} />
                    <Textarea label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
                    <Button disabled={held || photos.length === 0} loading={busy} onClick={() => void save(async () => {
                        const [primary, ...attachments] = photos;
                        if (!primary) throw new Error('Take a live photo first.');
                        return fieldEvidenceResumePayload({ ...primary, notes, attachments }, phase);
                    })}>Save {phase} photo{photos.length > 1 ? 's' : ''}</Button>
                </>}
                {phase === 'receipt' && <>
                    {purchaseReceipts.length > 0 && <>
                        {purchaseReceipts.map((receipt, index) => <Text size="sm" key={index}>{purchaseReceiptLine(receipt)}</Text>)}
                        <Button variant="light" loading={busy} disabled={held} onClick={() => void save(async () => ({ phase, usePurchaseReceipts: true }))}>Use the purchase receipts ({purchaseReceipts.length})</Button>
                    </>}
                    <Button variant="light" color="gray" loading={busy} disabled={held} onClick={() => void save(async () => ({ phase, noReceipt: true }))}>No materials bought - carry on</Button>
                </>}
            </>}
        </Stack>
    </Card>;
}
