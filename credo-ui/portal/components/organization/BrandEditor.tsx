import { feedback } from '@/lib/feedback';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ColorInput,
  Group,
  Image,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconPhotoUp, IconTrash } from '@tabler/icons-react';

import axios from 'axios';
import BrandedDocumentView from '@/components/documents/BrandedDocumentView';
import type { DocumentKind } from '@/lib/brandedDocument';
import {
  BRAND_FIELD_GROUPS,
  brandSavePayload,
  prepareLogoDataUrl,
  sampleBrandDocument,
  type BrandDraft,
  type OrgBrandView,
} from '@/lib/brandForm';

interface Props {
  orgTenantId: string;
  /** An org-scoped token with owner or admin rights. */
  getToken: () => Promise<string>;
  onSaved?: (brand: OrgBrandView) => void;
}

function errorText(error: any, fallback: string): string {
  return error?.response?.data?.message || error?.message || fallback;
}

/** Logo, colour, contact details and the standing wording on quotes, invoices and receipts. */
export default function BrandEditor({ orgTenantId, getToken, onSaved }: Props) {
  const [brand, setBrand] = useState<OrgBrandView | null>(null);
  const [draft, setDraft] = useState<BrandDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [previewKind, setPreviewKind] = useState<DocumentKind>('invoice');
  const fileInput = useRef<HTMLInputElement>(null);

  const headers = async () => ({ Authorization: `Bearer ${await getToken()}` });
  const path = `${process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'}/api/organizations/${encodeURIComponent(orgTenantId)}/brand`;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await axios.get(path, { headers: await headers() });
      const view = response.data as OrgBrandView;
      setBrand(view);
      setDraft(view);
    } catch (error) {
      setLoadError(errorText(error, 'Could not load your brand.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  const applySaved = (view: OrgBrandView, message: string) => {
    setBrand(view);
    setDraft((current) => ({ ...(current || view), logoUrl: view.logoUrl, primaryColor: view.primaryColor }));
    onSaved?.(view);
    feedback.success('New quotes, invoices and receipts use it. Earlier ones keep the brand they were issued with.', { title: message });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.displayName?.trim()) {
      feedback.error('Documents need the name your customers know you by.', { title: 'Add a name' });
      return;
    }
    setSaving(true);
    try {
      const response = await axios.put(path, brandSavePayload(draft), { headers: await headers() });
      const view = response.data as OrgBrandView;
      setDraft(view);
      applySaved(view, 'Brand saved');
    } catch (error) {
      feedback.error(errorText(error, 'Try again.'), { title: 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file?: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const dataUrl = await prepareLogoDataUrl(file);
      const response = await axios.put(`${path}/logo`, { dataUrl }, { headers: await headers() });
      applySaved(response.data as OrgBrandView, 'Logo saved');
    } catch (error) {
      feedback.error(errorText(error, 'Try a PNG or JPG.'), { title: 'Could not use that logo' });
    } finally {
      setLogoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const response = await axios.delete(`${path}/logo`, { headers: await headers() });
      applySaved(response.data as OrgBrandView, 'Logo removed');
    } catch (error) {
      feedback.error(errorText(error, 'Try again.'), { title: 'Could not remove the logo' });
    } finally {
      setLogoBusy(false);
    }
  };

  const sample = useMemo(() => sampleBrandDocument(previewKind), [previewKind]);
  const previewBrand = useMemo(() => (draft ? { ...draft, configured: true } : undefined), [draft]);
  const dirty = useMemo(
    () => Boolean(brand && draft && JSON.stringify(brandSavePayload(brand)) !== JSON.stringify(brandSavePayload(draft))),
    [brand, draft],
  );

  if (loadError) {
    return (
      <Alert color="red" title="Brand not loaded">
        <Stack gap="xs">
          <Text size="sm">{loadError}</Text>
          <Button size="xs" variant="light" onClick={load}>Try again</Button>
        </Stack>
      </Alert>
    );
  }
  if (!draft || !brand) {
    return (
      <Group justify="center" py="lg"><Loader size="sm" /></Group>
    );
  }

  const set = (key: keyof BrandDraft, value: unknown) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <Stack gap="md">
      {!brand.configured && (
        <Alert color="blue" variant="light">
          Your quotes, invoices, receipts, checkout page and shop use this. Add a logo and the details customers need to pay you.
        </Alert>
      )}

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>Logo and colour</Text>
          <Group gap="md" wrap="nowrap" align="center">
            {draft.logoUrl ? (
              <Image src={draft.logoUrl} alt="Logo" w={72} h={72} fit="contain" radius="sm" style={{ border: '1px solid #e5e7eb' }} />
            ) : (
              <Paper w={72} h={72} radius="sm" withBorder style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text size="xs" c="dimmed">No logo</Text>
              </Paper>
            )}
            <Stack gap={6} style={{ flex: 1 }}>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(event) => uploadLogo(event.currentTarget.files?.[0])}
              />
              <Button size="xs" leftSection={<IconPhotoUp size={14} />} loading={logoBusy} onClick={() => fileInput.current?.click()}>
                {draft.logoUrl ? 'Change logo' : 'Add logo'}
              </Button>
              {draft.logoUrl && (
                <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} disabled={logoBusy} onClick={removeLogo}>
                  Remove logo
                </Button>
              )}
            </Stack>
          </Group>
          <ColorInput
            label="Brand colour"
            value={draft.primaryColor || ''}
            onChange={(value) => set('primaryColor', value)}
            format="hex"
            swatches={['#0F766E', '#1D4ED8', '#7C3AED', '#B91C1C', '#C2410C', '#15803D', '#111827']}
          />
        </Stack>
      </Paper>

      {BRAND_FIELD_GROUPS.map((group) => (
        <Paper key={group.title} withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={600}>{group.title}</Text>
            {group.fields.map((field) =>
              field.multiline ? (
                <Textarea
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  autosize
                  minRows={2}
                  value={(draft[field.key] as string) || ''}
                  onChange={(event) => set(field.key, event.currentTarget.value)}
                />
              ) : (
                <TextInput
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={(draft[field.key] as string) || ''}
                  onChange={(event) => set(field.key, event.currentTarget.value)}
                />
              ),
            )}
            {group.title === 'Wording on documents' && (
              <Group grow>
                <NumberInput
                  label="Quotes valid for (days)"
                  min={1}
                  max={365}
                  value={draft.quoteValidityDays ?? ''}
                  onChange={(value) => set('quoteValidityDays', typeof value === 'number' ? value : undefined)}
                />
                <NumberInput
                  label="Invoices due in (days)"
                  min={0}
                  max={365}
                  value={draft.invoiceDueDays ?? ''}
                  onChange={(value) => set('invoiceDueDays', typeof value === 'number' ? value : undefined)}
                />
              </Group>
            )}
          </Stack>
        </Paper>
      ))}

      <Button onClick={save} loading={saving} disabled={!dirty && brand.configured}>
        {brand.configured ? 'Save brand' : 'Save and use this brand'}
      </Button>

      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text fw={600}>Preview</Text>
          <SegmentedControl
            size="xs"
            value={previewKind}
            onChange={(value) => setPreviewKind(value as DocumentKind)}
            data={[
              { value: 'quote', label: 'Quote' },
              { value: 'invoice', label: 'Invoice' },
              { value: 'receipt', label: 'Receipt' },
            ]}
          />
        </Group>
        <BrandedDocumentView model={sample} brand={previewBrand} height={460} />
      </Stack>
    </Stack>
  );
}
