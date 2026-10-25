import { feedback } from '@/lib/feedback';
import { useState, useEffect, useContext, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import { useUserRole } from '@/lib/useUserRole';
import { usePortalContext } from '@/lib/portalContext';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { readActiveOrganization } from '@/utils/organizationContext';
import { TEAM_ROLE_FALLBACK, teamRolesFromCatalog } from '@/utils/orgProfile';
import { contactAppLabel, contactAppStatus, contactInviteUrl } from '@/lib/contactAvailability';
import QRCode from 'react-qr-code';
import {
  Container, Title, Text, Paper, Group, Stack, Button, Badge,
  Table, Modal, TextInput, Textarea, ActionIcon, Tooltip,
  Loader, Center, Alert, Divider, CopyButton, Box, Select,
  JsonInput,
  Checkbox,
  NumberInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconPlus, IconTrash, IconEdit, IconSend, IconCopy, IconCheck,
  IconQrcode, IconUser, IconUsers, IconAlertCircle, IconRefresh,
  IconX, IconCurrencyDollar, IconBrandWhatsapp, IconShieldCheck,
} from '@tabler/icons-react';

/* ── Types ────────────────────────────────────────── */

interface Contact {
  id: string;
  orgTenantId: string;
  contactScope: 'internal' | 'external';
  name: string;
  phone?: string;
  email?: string;
  did?: string;
  notes?: string;
  walletTenantId?: string;
  linkedAt?: string;
  appStatus?: 'in_app' | 'invite' | 'no_phone';
  createdAt: string;
  updatedAt: string;
}

interface OfferResult {
  offerId: string;
  offerDeeplink: string;
  offerUri: string;
  expiresAt: string;
}

interface ProofRequestResult {
  requestId: string;
  requestUrl: string;
  deepLink: string;
  expiresAt: string;
  whatsappUrl?: string;
}

interface PaymentLinkResult {
  paymentLinkId: string;
  shortUrl: string;
  shortlinkCode: string;
  whatsappUrl?: string;
  amount: number;
  currency: string;
  expiresAt: string;
}

interface ContactInviteResult {
  contactId: string;
  claimToken: string;
  claimUrl: string;
  expiresAt: string;
}

/* ── Helpers ──────────────────────────────────────── */

const CREDENTIAL_TYPES = [
  { value: 'GenericID', label: 'Generic ID' },
  { value: 'PaymentReceipt', label: 'Payment Receipt' },
  { value: 'Invoice', label: 'Invoice' },
  { value: 'MembershipCard', label: 'Membership Card' },
  { value: 'StudentID', label: 'Student ID' },
];

/* ── Page ─────────────────────────────────────────── */

export default function ContactsPage() {
  const env = useContext(EnvContext);
  const router = useRouter();
  const { isIssuer, isGuest, ready } = useUserRole();
  const { isOrg } = usePortalContext();
  const baseUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

  // Auth guard — org-scoped issuer only
  useEffect(() => {
    if (!ready) return;
    if (isGuest) router.replace('/auth?tab=login&returnUrl=%2Fcontacts');
    else if (!isIssuer) router.replace('/wallet');
  }, [ready, isIssuer, isGuest, router]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create / Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    did: '',
    notes: '',
    contactScope: 'external' as 'internal' | 'external',
    teamRole: 'field_worker',
    inviteToWallet: false,
    inviteExpiryHours: 168,
  });
  const [teamRoleChoices, setTeamRoleChoices] = useState(TEAM_ROLE_FALLBACK);
  const [inviteResult, setInviteResult] = useState<ContactInviteResult | null>(null);
  const [showInviteResult, setShowInviteResult] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'internal' | 'external'>('all');

  // Payment Link modal
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [plContact, setPlContact] = useState<Contact | null>(null);
  const [plForm, setPlForm] = useState({ description: '', amount: '', currency: 'USD', sector: 'general' as 'education' | 'ecommerce' | 'general' });
  const [plResult, setPlResult] = useState<PaymentLinkResult | null>(null);
  const [creatingPl, setCreatingPl] = useState(false);

  // VC Offer modal
  const [showOffer, setShowOffer] = useState(false);

  // Request Proof modal
  const [showRequestProof, setShowRequestProof] = useState(false);
  const [proofContact, setProofContact] = useState<Contact | null>(null);
  const [proofTypes, setProofTypes] = useState('PaymentReceiptVC');
  const [proofPurpose, setProofPurpose] = useState('');
  const [proofProviderRef, setProofProviderRef] = useState('');
  const [proofResult, setProofResult] = useState<ProofRequestResult | null>(null);
  const [requestingProof, setRequestingProof] = useState(false);
  const [offerContact, setOfferContact] = useState<Contact | null>(null);
  // After a client's name or mobile is corrected: their unpaid bills, offered for sending again.
  const [billResend, setBillResend] = useState<{
    name: string;
    phone: string;
    bills: Array<{ id: string; description: string; amount: number; currency: string; invoiceRef?: string; expired: boolean }>;
  } | null>(null);
  const [resendingBills, setResendingBills] = useState(false);
  const [offerType, setOfferType] = useState<string>('GenericID');
  const [offerClaims, setOfferClaims] = useState('{}');
  const [offerResult, setOfferResult] = useState<OfferResult | null>(null);
  const [creatingOffer, setCreatingOffer] = useState(false);

  const getToken = () =>
    typeof window !== 'undefined'
      ? getPreferredTenantToken()
      : null;

  const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

  /* ── Fetch ── */
  const fetchContacts = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (isOrg) {
        const [externalResponse, internalResponse] = await Promise.all([
          axios.get(`${baseUrl}/api/contacts`, { ...auth(), params: { contactScope: 'external' } }),
          axios.get(`${baseUrl}/api/contacts`, { ...auth(), params: { contactScope: 'internal' } }),
        ]);
        const contacts = [
          ...(Array.isArray(externalResponse.data) ? externalResponse.data : externalResponse.data?.contacts ?? []),
          ...(Array.isArray(internalResponse.data) ? internalResponse.data : internalResponse.data?.contacts ?? []),
        ];
        setContacts(Array.from(new Map(contacts.map((contact: Contact) => [contact.id, contact])).values()));
      } else {
        const { data } = await axios.get(`${baseUrl}/api/contacts`, auth());
        setContacts(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load contacts';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, isOrg]);

  const displayedContacts = contacts.filter((contact) => (
    scopeFilter === 'all' ? true : contact.contactScope === scopeFilter
  ));

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    if (!showForm || !isOrg) return;
    const org = readActiveOrganization();
    const token = getToken();
    if (!org?.orgTenantId || !token) return;
    axios.get(`${baseUrl}/api/organizations/${encodeURIComponent(org.orgTenantId)}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      const fromSetup = teamRolesFromCatalog(Array.isArray(res.data) ? res.data : []);
      const next = fromSetup.length > 0 ? fromSetup : TEAM_ROLE_FALLBACK;
      setTeamRoleChoices(next);
      setForm((prev) => ({
        ...prev,
        teamRole: next.some((choice) => choice.value === prev.teamRole) ? prev.teamRole : (next[0]?.value || 'field_worker'),
      }));
    }).catch(() => setTeamRoleChoices(TEAM_ROLE_FALLBACK));
  }, [showForm, isOrg, baseUrl]);

  /* ── Create / Update ── */
  const openCreate = () => {
    setEditContact(null);
    setForm({
      name: '',
      phone: '',
      email: '',
      did: '',
      notes: '',
      contactScope: 'external',
      teamRole: teamRoleChoices[0]?.value || 'field_worker',
      inviteToWallet: false,
      inviteExpiryHours: 168,
    });
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setForm({
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      did: c.did || '',
      notes: c.notes || '',
      contactScope: c.contactScope || 'external',
      teamRole: teamRoleChoices[0]?.value || 'field_worker',
      inviteToWallet: false,
      inviteExpiryHours: 168,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      feedback.error('Name is required', { title: 'Validation' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        did: form.did || undefined,
        notes: form.notes || undefined,
        contactScope: form.contactScope,
        inviteToWallet: !editContact ? form.inviteToWallet : undefined,
        inviteExpiryHours: !editContact && form.inviteToWallet ? form.inviteExpiryHours : undefined,
      };
      if (editContact) {
        const detailsChanged =
          form.name.trim() !== (editContact.name || '').trim() || (form.phone || '').trim() !== (editContact.phone || '').trim();
        // Look up bills before saving, while the old mobile still matches them.
        const openBills = detailsChanged
          ? await axios
              .get(`${baseUrl}/api/contacts/${editContact.id}/open-bills`, auth())
              .then((res) => (Array.isArray(res.data) ? res.data : []))
              .catch(() => [])
          : [];
        await axios.patch(`${baseUrl}/api/contacts/${editContact.id}`, payload, auth());
        notifications.show({ title: 'Saved', message: `${form.name} updated`, color: 'green', icon: <IconCheck size={14} /> });
        if (openBills.length > 0 && /^\+?[1-9]\d{6,14}$/.test((form.phone || '').trim())) {
          setBillResend({ name: form.name.trim(), phone: form.phone.trim(), bills: openBills });
        }
      } else {
        if (form.contactScope === 'internal' && !form.teamRole) {
          feedback.warn('Someone on the team needs a role from setup.', { title: 'Choose a role' });
          setSaving(false);
          return;
        }
        const { data } = await axios.post(`${baseUrl}/api/contacts`, payload, auth());
        let joined = false;
        let teamMessage = '';
        if (form.contactScope === 'internal' && form.phone.trim()) {
          const org = readActiveOrganization();
          if (org?.orgTenantId) {
            try {
              const inviteRes = await axios.post(
                `${baseUrl}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members/invite`,
                { phone: form.phone.trim(), role: form.teamRole },
                auth(),
              );
              joined = true;
              teamMessage = inviteRes.data?.message || '';
            } catch (inviteErr: any) {
              feedback.warn(inviteErr?.response?.data?.message || 'They were saved, but not added to the team.', { title: 'Contact saved' });
            }
          }
        }
        if (joined) {
          notifications.show({ title: 'On the team', message: teamMessage || `${form.name} is on the team. Their staff card is in the app.`, color: 'green', icon: <IconCheck size={14} /> });
        } else if (form.contactScope !== 'internal' || !form.phone.trim()) {
          notifications.show({
            title: 'Created',
            message: form.contactScope === 'external'
              ? `${form.name} stays off the team. You can send them one job if they already have the app.`
              : `${form.name} added. Add a phone number to put them on the team.`,
            color: 'green',
            icon: <IconCheck size={14} />,
          });
        }
        if (data?.invite?.claimUrl) {
          setInviteResult(data.invite);
          setShowInviteResult(true);
          feedback.success(`Invite link ready for ${form.name}`, { title: 'Wallet invite created' });
        }
      }
      setShowForm(false);
      fetchContacts();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Save failed';
      feedback.error(msg, { title: 'Something went wrong' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Send unpaid bills again to corrected details ── */
  const resendBills = async () => {
    if (!billResend) return;
    setResendingBills(true);
    let sent = 0;
    const failed: string[] = [];
    for (const bill of billResend.bills) {
      try {
        await axios.patch(
          `${baseUrl}/api/payment-links/${encodeURIComponent(bill.id)}/payer`,
          { payerName: billResend.name, payerPhone: billResend.phone },
          auth(),
        );
        const opts = auth();
        await axios.post(
          `${baseUrl}/api/payment-links/${encodeURIComponent(bill.id)}/send`,
          { renew: bill.expired },
          { ...opts, headers: { ...(opts as any).headers, 'x-idempotency-key': crypto.randomUUID() } },
        );
        sent += 1;
      } catch (err: any) {
        failed.push(`${bill.invoiceRef || bill.description}: ${err?.response?.data?.message || err?.message || 'not sent'}`);
      }
    }
    setResendingBills(false);
    setBillResend(null);
    if (sent) notifications.show({ title: 'Bills sent', message: `${sent} bill${sent === 1 ? '' : 's'} sent to ${billResend.name}`, color: 'green', icon: <IconCheck size={14} /> });
    if (failed.length) feedback.warn(failed.join(' · '), { title: 'Some bills were not sent' });
  };

  /* ── Delete ── */
  const handleDelete = async (c: Contact) => {
    if (!confirm(`Remove ${c.name} from your directory?`)) return;
    try {
      await axios.delete(`${baseUrl}/api/contacts/${c.id}`, auth());
      feedback.warn(`${c.name} deleted`, { title: 'Removed' });
      fetchContacts();
    } catch (err: any) {
      feedback.fromError(err, { title: 'Something went wrong', fallback: 'Delete failed' });
    }
  };

  /* ── VC Offer ── */
  const openOffer = (c: Contact) => {
    setOfferContact(c);
    setOfferResult(null);
    setOfferClaims(JSON.stringify({ name: c.name, phone: c.phone || '' }, null, 2));
    setOfferType('GenericID');
    setShowOffer(true);
  };

  const handleCreateOffer = async () => {
    if (!offerContact) return;
    let claims: Record<string, unknown> = {};
    try {
      claims = JSON.parse(offerClaims);
    } catch {
      feedback.error('Claims must be valid JSON', { title: 'Invalid JSON' });
      return;
    }
    setCreatingOffer(true);
    try {
      const { data } = await axios.post(
        `${baseUrl}/api/contacts/${offerContact.id}/offer`,
        { credentialType: offerType, claims },
        auth(),
      );
      setOfferResult(data);
    } catch (err: any) {
      feedback.fromError(err, { title: 'Offer failed', fallback: 'Unknown error' });
    } finally {
      setCreatingOffer(false);
    }
  };

  /* ── Request Proof ── */
  const openRequestProof = (c: Contact) => {
    setProofContact(c);
    setProofResult(null);
    setProofTypes('PaymentReceiptVC');
    setProofPurpose(`Verify school fee payment receipt for ${c.name}`);
    setProofProviderRef('');
    setShowRequestProof(true);
  };

  const handleRequestProof = async () => {
    if (!proofContact) return;
    setRequestingProof(true);
    try {
      const credentialTypes = proofTypes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const { data } = await axios.post(
        `${baseUrl}/api/contacts/${proofContact.id}/request-proof`,
        {
          credentialTypes,
          purpose: proofPurpose.trim() || undefined,
          providerRef: proofProviderRef.trim() || undefined,
        },
        auth(),
      );
      setProofResult(data);
    } catch (err: any) {
      feedback.fromError(err, { title: 'Proof request not sent', fallback: 'Unknown error' });
    } finally {
      setRequestingProof(false);
    }
  };

  /* ── Payment Link ── */
  const openPaymentLink = (c: Contact) => {
    setPlContact(c);
    setPlResult(null);
    setPlForm({ description: '', amount: '', currency: 'USD', sector: 'general' });
    setShowPaymentLink(true);
  };

  const handleCreatePaymentLink = async () => {
    if (!plContact) return;
    const amount = parseFloat(plForm.amount);
    if (!plForm.description.trim() || isNaN(amount) || amount <= 0) {
      feedback.error('Description and a positive amount are required', { title: 'Validation' });
      return;
    }
    setCreatingPl(true);
    try {
      const { data } = await axios.post(
        `${baseUrl}/api/contacts/${plContact.id}/payment-link`,
        { description: plForm.description.trim(), amount, currency: plForm.currency, sector: plForm.sector },
        {
          ...auth(),
          headers: {
            ...auth().headers,
            'x-idempotency-key': `portal-contact-payment-link:${plContact.id}:${plForm.description.trim()}:${amount}:${plForm.currency}:${plForm.sector}`,
          },
        },
      );
      setPlResult(data);
    } catch (err: any) {
      feedback.fromError(err, { title: 'Failed', fallback: 'Unknown error' });
    } finally {
      setCreatingPl(false);
    }
  };

  const whatsappLink = (c: Contact, deeplink: string) => {
    const phone = (c.phone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(`Hi ${c.name}, here is your credential offer:\n${deeplink}`);
    return `https://wa.me/${phone}?text=${msg}`;
  };

  /* ── Render ── */
  if (!ready) {
    return (
      <Layout title="Contacts">
        <Center style={{ minHeight: 300 }}><Loader /></Center>
      </Layout>
    );
  }

  return (
    <Layout title="Contacts">
      <Container size="lg" py="md">
        <Group justify="space-between" mb="md">
          <Stack gap={0}>
            <Title order={3}>Trusted Network</Title>
            <Text c="dimmed" size="sm">
              Manage trusted people and services, and send offers, payments, or verifiable requests with context.
            </Text>
          </Stack>
          <Group gap="xs">
            <Select
              size="xs"
              data={[
                { value: 'all', label: 'All contacts' },
                { value: 'internal', label: 'On the team' },
                { value: 'external', label: 'Outside' },
              ]}
              value={scopeFilter}
              onChange={(value) => setScopeFilter((value as 'all' | 'internal' | 'external') || 'all')}
            />
            <ActionIcon variant="subtle" onClick={fetchContacts} title="Refresh">
              <IconRefresh size={16} />
            </ActionIcon>
            <Button leftSection={<IconPlus size={14} />} onClick={openCreate} size="sm">
              Add Contact
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />} mb="md" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : displayedContacts.length === 0 ? (
          <Paper p="xl" withBorder ta="center">
            <IconUsers size={40} style={{ opacity: 0.3 }} />
            <Text c="dimmed" mt="sm">No trusted contacts yet. Add your first connection or service.</Text>
            <Button mt="md" leftSection={<IconPlus size={14} />} onClick={openCreate}>
              Add Contact
            </Button>
          </Paper>
        ) : (
          <Paper withBorder>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Phone</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Scope</Table.Th>
                  <Table.Th>App</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {displayedContacts.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconUser size={14} style={{ opacity: 0.5 }} />
                        <Text size="sm" fw={500}>{c.name}</Text>
                      </Group>
                      {c.notes && <Text size="xs" c="dimmed" truncate maw={220}>{c.notes}</Text>}
                    </Table.Td>
                    <Table.Td>
                      {c.phone
                        ? <Text size="sm">{c.phone}</Text>
                        : <Text size="xs" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      {c.email
                        ? <Text size="sm">{c.email}</Text>
                        : <Text size="xs" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="outline" color={c.contactScope === 'internal' ? 'blue' : 'gray'}>
                        {c.contactScope === 'internal' ? 'On the team' : 'Outside'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {contactAppStatus(c.appStatus) === 'in_app' ? (
                        <Badge variant="light" color="green" size="xs">In the app</Badge>
                      ) : contactAppStatus(c.appStatus) === 'invite' && c.phone ? (
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="green"
                          leftSection={<IconBrandWhatsapp size={12} />}
                          component="a"
                          href={contactInviteUrl(c.phone, c.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Invite
                        </Button>
                      ) : (
                        <Text size="xs" c="dimmed">{contactAppLabel(c.appStatus)}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end">
                        {contactAppStatus(c.appStatus) === 'in_app' && (
                          <Tooltip label="Ask them to share a record">
                            <ActionIcon variant="light" color="violet" size="sm" onClick={() => openRequestProof(c)}>
                              <IconShieldCheck size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Request Payment">
                          <ActionIcon variant="light" color="teal" size="sm" onClick={() => openPaymentLink(c)}>
                            <IconCurrencyDollar size={14} />
                          </ActionIcon>
                        </Tooltip>
                        {c.contactScope === 'internal' && contactAppStatus(c.appStatus) === 'in_app' && (
                          <Tooltip label="Send a card">
                            <ActionIcon variant="light" color="blue" size="sm" onClick={() => openOffer(c)}>
                              <IconSend size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Edit">
                          <ActionIcon variant="subtle" size="sm" onClick={() => openEdit(c)}>
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Remove">
                          <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDelete(c)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Container>

      {/* ── Request Proof Modal ── */}
      <Modal opened={Boolean(billResend)} onClose={() => !resendingBills && setBillResend(null)} title="Send unpaid bills again?" centered>
        {billResend && (
          <Stack gap="sm">
            <Text size="sm">
              {billResend.name} has {billResend.bills.length} unpaid bill{billResend.bills.length === 1 ? '' : 's'}. Send {billResend.bills.length === 1 ? 'it' : 'them'} to {billResend.phone} now? Expired links are renewed first.
            </Text>
            {billResend.bills.map((bill) => (
              <Paper key={bill.id} withBorder p="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" lineClamp={1}>{bill.invoiceRef || bill.description}</Text>
                  <Group gap={6} wrap="nowrap">
                    {bill.expired && <Badge size="xs" color="orange">Expired</Badge>}
                    <Text size="sm" fw={600}>{bill.currency} {Number(bill.amount).toFixed(2)}</Text>
                  </Group>
                </Group>
              </Paper>
            ))}
            <Group justify="flex-end">
              <Button variant="subtle" disabled={resendingBills} onClick={() => setBillResend(null)}>Not now</Button>
              <Button leftSection={<IconSend size={14} />} loading={resendingBills} onClick={() => void resendBills()}>
                Send to {billResend.name}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={showRequestProof}
        onClose={() => { setShowRequestProof(false); setProofResult(null); }}
        title={proofContact ? `Request Proof — ${proofContact.name}` : 'Request Proof'}
        size="md"
      >
        {!proofResult ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Creates an OID4VP presentation request. The contact's SSI wallet receives the
              request and submits a proof of their credential — no server ever sees raw PII.
              School fee receipts are <strong>non-revocable permanent proofs</strong> and will
              verify successfully regardless of revocation status.
            </Text>
            <TextInput
              label="Credential types (comma-separated)"
              placeholder="PaymentReceiptVC, SchoolFeeReceiptVC"
              required
              value={proofTypes}
              onChange={(e) => setProofTypes(e.target.value)}
            />
            <TextInput
              label="Purpose (shown in wallet UI)"
              placeholder="Verify school fee payment Term 3 2026"
              value={proofPurpose}
              onChange={(e) => setProofPurpose(e.target.value)}
            />
            <TextInput
              label="Invoice / Provider ref (optional — links to reconciliation timeline)"
              placeholder="INV-abc123"
              value={proofProviderRef}
              onChange={(e) => setProofProviderRef(e.target.value)}
            />
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" onClick={() => setShowRequestProof(false)}>Cancel</Button>
              <Button
                loading={requestingProof}
                leftSection={<IconShieldCheck size={14} />}
                color="violet"
                onClick={handleRequestProof}
              >
                Send Proof Request
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="md">
            <Alert color="violet" icon={<IconShieldCheck size={16} />} title="Proof request created">
              Request ID: {proofResult.requestId.slice(0, 16)}… — expires {new Date(proofResult.expiresAt).toLocaleString()}
            </Alert>

            <Divider label="Share with contact" />

            <Box ta="center">
              <Text size="xs" c="dimmed" mb="xs">Scan to open in wallet app</Text>
              <QRCode value={proofResult.requestUrl} size={200} style={{ margin: '0 auto' }} />
            </Box>

            <Paper p="sm" withBorder>
              <Text size="xs" c="dimmed" mb={4}>Wallet deep-link</Text>
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" style={{ wordBreak: 'break-all', flex: 1 }}>{proofResult.deepLink}</Text>
                <CopyButton value={proofResult.deepLink}>
                  {({ copied, copy }) => (
                    <ActionIcon variant="subtle" onClick={copy} size="sm">
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                  )}
                </CopyButton>
              </Group>
            </Paper>

            {proofResult.whatsappUrl && (
              <Button
                component="a"
                href={proofResult.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                color="green"
                leftSection={<IconBrandWhatsapp size={14} />}
                fullWidth
              >
                Send via WhatsApp to {proofContact?.phone}
              </Button>
            )}

            <Button
              variant="subtle"
              leftSection={<IconX size={14} />}
              onClick={() => { setShowRequestProof(false); setProofResult(null); }}
              fullWidth
            >
              Close
            </Button>
          </Stack>
        )}
      </Modal>

      {/* ── Create / Edit Modal ── */}
      <Modal
        opened={showForm}
        onClose={() => setShowForm(false)}
        title={editContact ? `Edit ${editContact.name}` : 'Add Contact'}
        size="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="Tafadzwa Moyo"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextInput
            label="Phone (E.164)"
            placeholder="+263777123456"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <TextInput
            label="Email"
            placeholder="tafadzwa@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <TextInput
            label="Identifier (optional)"
            placeholder="did:key:z6Mk..."
            value={form.did}
            onChange={(e) => setForm({ ...form, did: e.target.value })}
          />
          <Textarea
            label="Notes"
            placeholder="Student ID, class, etc."
            autosize
            minRows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <Select
            label="Contact Scope"
            data={[
              { value: 'external', label: 'Outside contact' },
              { value: 'internal', label: 'On the team' },
            ]}
            value={form.contactScope}
            onChange={(value) => setForm({ ...form, contactScope: (value as 'internal' | 'external') || 'external' })}
          />
          {form.contactScope === 'internal' ? (
            <Select
              label="Role"
              description="Taken from the answers you gave at setup. They get a staff card if they already have the app."
              data={teamRoleChoices}
              value={teamRoleChoices.some((choice) => choice.value === form.teamRole) ? form.teamRole : teamRoleChoices[0]?.value}
              onChange={(value) => setForm({ ...form, teamRole: value || teamRoleChoices[0]?.value || 'field_worker' })}
            />
          ) : (
            <Text size="xs" c="dimmed">They stay off the team. You can still send them one job, and they get the job assignment record if they already have the app.</Text>
          )}
          {!editContact && (
            <>
              <Checkbox
                label="Invite this contact to create/link a wallet now"
                checked={form.inviteToWallet}
                onChange={(e) => setForm({ ...form, inviteToWallet: e.currentTarget.checked })}
              />
              {form.inviteToWallet && (
                <NumberInput
                  label="Invite expiry (hours)"
                  min={1}
                  max={720}
                  value={form.inviteExpiryHours}
                  onChange={(value) => setForm({ ...form, inviteExpiryHours: Number(value) || 168 })}
                />
              )}
            </>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>
              {editContact ? 'Save Changes' : 'Add Contact'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={showInviteResult}
        onClose={() => { setShowInviteResult(false); setInviteResult(null); }}
        title="Wallet Invite Link"
        size="md"
      >
        {inviteResult && (
          <Stack gap="sm">
            <Alert color="teal" icon={<IconCheck size={16} />}>
              Invite created. Expires {new Date(inviteResult.expiresAt).toLocaleString()}.
            </Alert>
            <Paper p="sm" withBorder>
              <Text size="xs" c="dimmed" mb={4}>Claim URL</Text>
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" style={{ wordBreak: 'break-all', flex: 1 }}>
                  {inviteResult.claimUrl}
                </Text>
                <CopyButton value={inviteResult.claimUrl}>
                  {({ copied, copy }) => (
                    <ActionIcon variant="subtle" onClick={copy} size="sm">
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                  )}
                </CopyButton>
              </Group>
            </Paper>
            <Button
              component="a"
              href={`https://wa.me/${(form.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${form.name}, use this secure link to create/link your wallet: ${inviteResult.claimUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              color="green"
              leftSection={<IconBrandWhatsapp size={14} />}
              disabled={!form.phone}
              fullWidth
            >
              Send Invite via WhatsApp
            </Button>
          </Stack>
        )}
      </Modal>

      {/* ── Payment Link Modal ── */}
      <Modal
        opened={showPaymentLink}
        onClose={() => { setShowPaymentLink(false); setPlResult(null); }}
        title={plContact ? `Request Payment — ${plContact.name}` : 'Request Payment'}
        size="md"
      >
        {!plResult ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Creates a secure payment link you can share via WhatsApp, QR, or any channel.
              After payment the system automatically issues a Receipt VC — the contact can
              register and see it in their portal wallet.
            </Text>
            <TextInput
              label="Description"
              placeholder="School fees Term 2"
              required
              value={plForm.description}
              onChange={(e) => setPlForm({ ...plForm, description: e.target.value })}
            />
            <Group grow>
              <TextInput
                label="Amount"
                placeholder="50"
                required
                type="number"
                min="0.01"
                step="0.01"
                value={plForm.amount}
                onChange={(e) => setPlForm({ ...plForm, amount: e.target.value })}
              />
              <Select
                label="Currency"
                data={['USD', 'ZIG', 'ZWL']}
                value={plForm.currency}
                onChange={(v) => setPlForm({ ...plForm, currency: v || 'USD' })}
              />
            </Group>
            <Select
              label="Sector"
              data={[
                { value: 'general', label: 'General' },
                { value: 'education', label: 'Education (no delivery step)' },
                { value: 'ecommerce', label: 'E-commerce (delivery + PIN)' },
              ]}
              value={plForm.sector}
              onChange={(v) => setPlForm({ ...plForm, sector: (v as any) || 'general' })}
            />
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" onClick={() => setShowPaymentLink(false)}>Cancel</Button>
              <Button
                loading={creatingPl}
                leftSection={<IconCurrencyDollar size={14} />}
                color="teal"
                onClick={handleCreatePaymentLink}
              >
                Create Payment Link
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="md">
            <Alert color="teal" icon={<IconCheck size={16} />} title="Payment link created">
              {plResult.amount} {plResult.currency} — expires {new Date(plResult.expiresAt).toLocaleString()}
            </Alert>

            <Divider label="Share via" />

            <Box ta="center">
              <Text size="xs" c="dimmed" mb="xs">Scan to open public checkout page</Text>
              <QRCode value={plResult.shortUrl} size={200} style={{ margin: '0 auto' }} />
            </Box>

            <Paper p="sm" withBorder>
              <Text size="xs" c="dimmed" mb={4}>Payment URL</Text>
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" style={{ wordBreak: 'break-all', flex: 1 }}>{plResult.shortUrl}</Text>
                <CopyButton value={plResult.shortUrl}>
                  {({ copied, copy }) => (
                    <ActionIcon variant="subtle" onClick={copy} size="sm">
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                  )}
                </CopyButton>
              </Group>
            </Paper>

            {plResult.whatsappUrl && (
              <Button
                component="a"
                href={plResult.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                color="green"
                leftSection={<IconBrandWhatsapp size={14} />}
                fullWidth
              >
                Send via WhatsApp to {plContact?.phone}
              </Button>
            )}

            <Text size="xs" c="dimmed" ta="center">
              Once paid the receipt VC is issued automatically.
              The contact can register at the portal with their phone number to view it.
            </Text>

            <Button
              variant="subtle"
              leftSection={<IconX size={14} />}
              onClick={() => { setShowPaymentLink(false); setPlResult(null); }}
              fullWidth
            >
              Close
            </Button>
          </Stack>
        )}
      </Modal>

      {/* ── VC Offer Modal ── */}
      <Modal
        opened={showOffer}
        onClose={() => { setShowOffer(false); setOfferResult(null); }}
        title={offerContact ? `Send VC Offer — ${offerContact.name}` : 'Send VC Offer'}
        size="lg"
      >
        {!offerResult ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Choose the credential type and fill in the claims. The contact will receive an
              <strong> openid-credential-offer://</strong> link they can accept in any OID4VC wallet.
            </Text>
            <Select
              label="Credential Type"
              data={CREDENTIAL_TYPES}
              value={offerType}
              onChange={(v) => setOfferType(v || 'GenericID')}
            />
            <JsonInput
              label="Claims (JSON)"
              placeholder='{"name": "Tafadzwa", "studentId": "ST001"}'
              value={offerClaims}
              onChange={setOfferClaims}
              formatOnBlur
              autosize
              minRows={4}
            />
            {offerContact?.did && (
              <Alert color="teal">
                <Text size="xs">Holder DID known — credential will be holder-bound to <code>{offerContact.did.slice(0, 30)}…</code></Text>
              </Alert>
            )}
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" onClick={() => setShowOffer(false)}>Cancel</Button>
              <Button
                loading={creatingOffer}
                leftSection={<IconSend size={14} />}
                onClick={handleCreateOffer}
              >
                Create Offer
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="md">
            <Alert color="green" icon={<IconCheck size={16} />} title="Offer created">
              Expires {new Date(offerResult.expiresAt).toLocaleString()}
            </Alert>

            <Divider label="Share via" />

            {/* QR code */}
            <Box ta="center">
              <Text size="xs" c="dimmed" mb="xs">Scan with any OID4VC wallet</Text>
              <QRCode value={offerResult.offerDeeplink} size={200} style={{ margin: '0 auto' }} />
            </Box>

            {/* Deeplink */}
            <Paper p="sm" withBorder>
              <Text size="xs" c="dimmed" mb={4}>Deeplink</Text>
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" style={{ wordBreak: 'break-all', flex: 1 }}>
                  {offerResult.offerDeeplink}
                </Text>
                <CopyButton value={offerResult.offerDeeplink}>
                  {({ copied, copy }) => (
                    <ActionIcon variant="subtle" onClick={copy} size="sm">
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                  )}
                </CopyButton>
              </Group>
            </Paper>

            {/* WhatsApp */}
            {offerContact?.phone && (
              <Button
                component="a"
                href={whatsappLink(offerContact, offerResult.offerDeeplink)}
                target="_blank"
                rel="noopener noreferrer"
                color="green"
                leftSection={<IconSend size={14} />}
                fullWidth
              >
                Send via WhatsApp to {offerContact.phone}
              </Button>
            )}

            <Button
              variant="subtle"
              leftSection={<IconX size={14} />}
              onClick={() => { setShowOffer(false); setOfferResult(null); }}
              fullWidth
            >
              Close
            </Button>
          </Stack>
        )}
      </Modal>
    </Layout>
  );
}
