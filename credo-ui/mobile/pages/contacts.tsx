import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  Stack, Title, Text, Box, TextInput, ActionIcon, Group, Avatar, Badge,
  Card, Center, Loader, Alert, ThemeIcon, Divider, Button, Select, CopyButton, Paper, SegmentedControl, Checkbox, Skeleton
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconUsers, IconSearch, IconRefresh, IconAlertCircle, IconPhone, IconMail,
  IconPlus, IconChevronRight, IconLink, IconSend, IconBrandWhatsapp,
  IconCheck, IconCopy, IconBuilding, IconStar, IconShieldCheck, IconSchool,
  IconBuildingBank, IconTruck, IconHeartbeat
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import BottomSheet from '@/components/shared/BottomSheet';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api, { safeArray } from '@/lib/api';
import { getActiveOrgLabel, getContextMode, getPreferredToken, getUserRole } from '@/lib/auth';

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  did?: string;
  contactScope: 'internal' | 'external';
  sourceType?: string;
  linkedAt?: string;
  createdAt: string;
}

interface DiscoveryOrganization {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  category: string;
  trustScore: number;
  verificationStatus: string;
  availableServices: number;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  government: { label: 'Government', icon: IconBuilding, color: 'indigo' },
  education: { label: 'Education', icon: IconSchool, color: 'grape' },
  telecom: { label: 'Telecom', icon: IconPhone, color: 'cyan' },
  finance: { label: 'Finance', icon: IconBuildingBank, color: 'teal' },
  supplier: { label: 'Suppliers', icon: IconTruck, color: 'orange' },
  healthcare: { label: 'Healthcare', icon: IconHeartbeat, color: 'pink' },
};

function DiscoveryOrgCard({ org, onClick }: { org: DiscoveryOrganization; onClick: () => void }) {
  const Icon = CATEGORY_CONFIG[org.category]?.icon || IconBuilding;
  const color = CATEGORY_CONFIG[org.category]?.color || 'gray';

  return (
    <Card p="sm" radius="md" withBorder onClick={onClick} style={{ cursor: 'pointer' }}>
      <Group wrap="nowrap">
        <ThemeIcon size="lg" radius="md" variant="light" color={color}>
          {org.logo ? <Avatar src={org.logo} size="sm" radius="md" /> : <Icon size={20} />}
        </ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600} style={{ flex: 1 }} truncate>{org.name}</Text>
            {org.verificationStatus === 'verified' && (
              <ThemeIcon size="xs" color="blue" variant="light" radius="xl">
                <IconShieldCheck size={10} />
              </ThemeIcon>
            )}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2}>{org.description}</Text>
          <Group gap={6} mt={4} wrap="wrap">
            <Badge size="xs" variant="light" color={color}>
              {CATEGORY_CONFIG[org.category]?.label || org.category}
            </Badge>
            {org.availableServices > 0 && (
              <Text size="xs" c="dimmed">
                {org.availableServices} {org.availableServices === 1 ? 'service' : 'services'}
              </Text>
            )}
            {org.trustScore > 0 && (
              <Group gap={2}>
                <IconStar size={12} color="var(--mantine-color-yellow-5)" fill="var(--mantine-color-yellow-5)" />
                <Text size="xs" fw={500}>{org.trustScore.toFixed(1)}</Text>
              </Group>
            )}
          </Group>
        </Box>
        <IconChevronRight size={16} color="light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-2))" />
      </Group>
    </Card>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [contextMode, setContextMode] = useState<'personal' | 'org'>('personal');
  const [activeOrgLabel, setActiveOrgLabel] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const isOrgContext = contextMode === 'org';
  const isHolder = contextMode === 'personal' || role === 'holder';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [publicOrgs, setPublicOrgs] = useState<DiscoveryOrganization[]>([]);
  const [publicOrgLoading, setPublicOrgLoading] = useState(false);
  const [discoverySearch, setDiscoverySearch] = useState('');
  const [discoveryCategory, setDiscoveryCategory] = useState<string | null>(null);

  // Actions
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ description: '', amount: '', currency: 'USD' });
  const [paying, setPaying] = useState(false);
  const [payLinkResult, setPayLinkResult] = useState<string | null>(null);
  const [payLinkRouteToken, setPayLinkRouteToken] = useState<string | null>(null);

  const [showVC, setShowVC] = useState(false);
  const [vcForm, setVcForm] = useState({ type: 'EmploymentCredential', role: '' });
  const [issuing, setIssuing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', phone: '', email: '', contactScope: 'external' as 'internal' | 'external', inviteToWallet: true });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const mode = getContextMode() === 'org' ? 'org' : 'personal';
    setContextMode(mode);
    setActiveOrgLabel(getActiveOrgLabel());
    setRole(getUserRole());
    setMounted(true);
  }, []);

  const fetchContacts = useCallback(async () => {
    if (!mounted) return;
    setLoading(true);
    setError(null);
    try {
      const token = getPreferredToken();
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

      let data: any[] = [];
      if (isOrgContext) {
        // Org contacts are split by scope on the API; fetch both so owner/internal members are always visible.
        const [externalRes, internalRes] = await Promise.all([
          api.get('/api/contacts', { params: { contactScope: 'external' }, headers: authHeaders }),
          api.get('/api/contacts', { params: { contactScope: 'internal' }, headers: authHeaders }),
        ]);
        const merged = [
          ...safeArray<any>(externalRes.data?.contacts ?? externalRes.data),
          ...safeArray<any>(internalRes.data?.contacts ?? internalRes.data),
        ];
        data = Array.from(new Map(merged.map((entry) => [entry.id, entry])).values());
      } else {
        const res = await api.get('/api/contacts', {
          headers: authHeaders,
        });
        data = safeArray(res.data?.contacts ?? res.data);
      }

      setContacts(data.map((c: any) => ({
        id: c.id,
        name: c.name ?? c.phone ?? c.email ?? 'Unknown',
        phone: c.phone,
        email: c.email,
        did: c.did,
        contactScope: c.contactScope ?? 'external',
        sourceType: c.sourceType,
        linkedAt: c.linkedAt,
        createdAt: c.createdAt,
      })));
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [isOrgContext, mounted]);

  const fetchDiscoveryOrganizations = useCallback(async (query?: string, category?: string | null) => {
    if (!mounted || !isOrgContext) return;
    setPublicOrgLoading(true);
    try {
      const searchTerm = (query ?? discoverySearch).trim();
      const categoryFilter = category ?? discoveryCategory ?? undefined;
      const response = searchTerm
        ? await api.get('/api/discovery/search', {
          params: { q: searchTerm, category: categoryFilter },
        })
        : await api.get('/api/discovery/organizations', {
          params: { verifiedOnly: true, category: categoryFilter },
        });

      const items = safeArray<any>(response.data || []).map((org: any) => ({
        id: org.id,
        name: org.name || org.displayName || 'Unknown Organization',
        description: org.description,
        logo: org.logo || org.logoUrl,
        category: org.category || 'supplier',
        trustScore: Number(org.trustScore || 0),
        verificationStatus: org.verificationStatus || 'unverified',
        availableServices: Number(org.availableServices || org.servicesCount || 0),
      }));

      setPublicOrgs(items);
    } catch {
      setPublicOrgs([]);
    } finally {
      setPublicOrgLoading(false);
    }
  }, [discoveryCategory, discoverySearch, isOrgContext, mounted]);

  useEffect(() => {
    if (!mounted) return;
    void fetchContacts();
  }, [fetchContacts, mounted]);

  useEffect(() => {
    if (!mounted || !isOrgContext) {
      setPublicOrgs([]);
      return;
    }

    void fetchDiscoveryOrganizations('', discoveryCategory);
  }, [discoveryCategory, fetchDiscoveryOrganizations, isOrgContext, mounted]);

  const filtered = contacts.filter((c) =>
    (scopeFilter === 'all' || c.contactScope === scopeFilter)
    && (
      !search
      || c.name.toLowerCase().includes(search.toLowerCase())
      || c.phone?.includes(search)
      || c.email?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const getInitials = (name: string) => name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const extractPaymentCode = (rawUrl?: string): string | null => {
    if (!rawUrl) return null;
    try {
      const parsed = new URL(rawUrl);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((part) => part === 'v' || part === 'pay');
      return idx >= 0 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : null;
    } catch {
      const match = rawUrl.match(/\/(?:v|pay)\/([^/?#]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
  };

  const handleCreateContact = async () => {
    if (!createForm.name) return;
    setCreating(true);
    try {
      await api.post('/api/contacts', {
        name: createForm.name,
        phone: createForm.phone || undefined,
        email: createForm.email || undefined,
        contactScope: createForm.contactScope,
        inviteToWallet: createForm.inviteToWallet,
      });
      notifications.show({ title: 'Success', message: 'Contact created', color: 'green' });
      setShowCreate(false);
      setCreateForm({ name: '', phone: '', email: '', contactScope: 'external', inviteToWallet: true });
      fetchContacts();
    } catch (err: any) {
      notifications.show({ title: 'Error', message: err.response?.data?.message ?? err.message, color: 'red' });
    } finally {
      setCreating(false);
    }
  };

  const handleCreatePaymentLink = async () => {
    if (!selected || selected.sourceType === 'membership-org' || !payForm.amount || !payForm.description) return;
    setPaying(true);
    try {
      const { data } = await api.post(`/api/contacts/${selected.id}/payment-link`, {
        description: payForm.description,
        amount: parseFloat(payForm.amount),
        currency: payForm.currency,
      });
      const shareUrl = data?.link?.shortlinkUrl || data?.shortUrl || null;
      const routeToken = data?.link?.id || data?.paymentLinkId || data?.link?.shortlinkCode || extractPaymentCode(shareUrl || undefined);
      setPayLinkResult(shareUrl);
      setPayLinkRouteToken(routeToken || null);
      notifications.show({ title: 'Success', message: 'Payment link created', color: 'green' });
      setPayForm({ description: '', amount: '', currency: 'USD' });
    } catch (err: any) {
      notifications.show({ title: 'Error', message: err.response?.data?.message ?? err.message, color: 'red' });
    } finally {
      setPaying(false);
    }
  };

  const handleIssueVC = async () => {
    if (!selected || selected.sourceType === 'membership-org') return;
    setIssuing(true);
    try {
      await api.post(`/api/contacts/${selected.id}/offer`, {
        credentialType: vcForm.type,
        claims: { employeeRole: vcForm.role, name: selected.name }
      });
      notifications.show({ title: 'Success', message: 'Credential offer sent', color: 'green' });
      setShowVC(false);
      setVcForm({ type: 'EmploymentCredential', role: '' });
    } catch (err: any) {
      notifications.show({ title: 'Error', message: err.response?.data?.message ?? err.message, color: 'red' });
    } finally {
      setIssuing(false);
    }
  };

  const shareWhatsApp = (phone: string, text: string) => {
    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const runDiscoverySearch = () => {
    void fetchDiscoveryOrganizations(discoverySearch, discoveryCategory);
  };

  return (
    <AppShellMobile minimalHeader>
      <Stack gap={0} pos="relative">
        {/* Header */}
        <Box px="md" pt="md" pb="sm">
          <Group justify="space-between" align="center" mb="sm">
            <Title order={1} fw={700} style={{ fontSize: 36, lineHeight: 1.05 }}>Trusted network</Title>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={fetchContacts} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>

          <Group gap={8} mb="sm">
            <Badge variant="light" color={isOrgContext ? 'teal' : 'indigo'}>
              {mounted
                ? (isOrgContext ? `Org: ${activeOrgLabel || 'Current org'}` : 'Trusted people and services')
                : 'Trusted network'}
            </Badge>
            <Badge variant="outline" color="gray">{contacts.length} total</Badge>
          </Group>

          <SegmentedControl
            fullWidth
            size="xs"
            radius="md"
            value={scopeFilter}
            onChange={(value) => setScopeFilter(value as 'all' | 'internal' | 'external')}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Internal', value: 'internal' },
              { label: 'External', value: 'external' },
            ]}
            mb="sm"
          />

          <TextInput
            placeholder="Search contacts…" leftSection={<IconSearch size={16} />}
            value={search} onChange={(e) => setSearch(e.currentTarget.value)}
            radius="xl" size="sm"
          />
        </Box>

        {loading ? (
          <Center py="xl"><Loader size="sm" /></Center>
        ) : error ? (
          <Box px="md"><ErrorAlert message={error} /></Box>
        ) : filtered.length === 0 ? (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <ThemeIcon size={56} radius="xl" variant="light" color="gray"><IconUsers size={28} /></ThemeIcon>
              <Text fw={600} c="dimmed">{search ? 'No contacts found' : 'No contacts yet'}</Text>
            </Stack>
          </Center>
        ) : (
          <Stack gap={0} px="md" pb={80} mt="xs">
            <Text size="xs" c="dimmed" mb="xs" tt="uppercase" fw={600}>{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</Text>
            {filtered.map((contact) => (
              <Card key={contact.id} radius="md" mb="xs" withBorder padding="sm"
                onClick={() => setSelected(contact)} style={{ cursor: 'pointer' }}
              >
                <Group gap="sm" wrap="nowrap">
                  <Avatar size={40} radius="xl" color="credentis">{getInitials(contact.name)}</Avatar>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} mb={2} wrap="nowrap">
                      <Text fw={600} size="sm" truncate>{contact.name}</Text>
                      <Badge size="xs" color={contact.contactScope === 'internal' ? 'indigo' : 'teal'} variant="light">
                        {contact.contactScope}
                      </Badge>
                      {contact.sourceType === 'membership-org' && <Badge size="xs" color="indigo" variant="light">Org</Badge>}
                      {contact.linkedAt && <Badge size="xs" color="green" variant="light">Linked</Badge>}
                    </Group>
                    {contact.phone && <Text size="xs" c="dimmed" truncate>{contact.phone}</Text>}
                  </Box>
                  <IconChevronRight size={16} color="light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-2))" />
                </Group>
              </Card>
            ))}

            {isOrgContext && (
              <Paper p="md" radius="md" withBorder mt="md">
                <Group justify="space-between" align="flex-start" mb="xs" wrap="nowrap">
                  <Box style={{ minWidth: 0 }}>
                    <Text fw={600} size="sm">Discover Organizations</Text>
                    <Text size="xs" c="dimmed">
                      Browse verified orgs and services from this organization context.
                    </Text>
                  </Box>
                  <Button size="xs" variant="light" onClick={runDiscoverySearch} loading={publicOrgLoading}>
                    Search
                  </Button>
                </Group>

                <TextInput
                  placeholder="Search organizations or services…"
                  leftSection={<IconSearch size={16} />}
                  value={discoverySearch}
                  onChange={(event) => setDiscoverySearch(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && runDiscoverySearch()}
                  radius="xl"
                  size="sm"
                  mb="sm"
                />

                <Group gap={6} mb="sm" wrap="wrap">
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                    const active = discoveryCategory === key;
                    const Icon = config.icon;
                    return (
                      <Button
                        key={key}
                        size="xs"
                        variant={active ? 'filled' : 'light'}
                        color={config.color}
                        leftSection={<Icon size={12} />}
                        onClick={() => {
                          const next = active ? null : key;
                          setDiscoveryCategory(next);
                          void fetchDiscoveryOrganizations(discoverySearch, next);
                        }}
                      >
                        {config.label}
                      </Button>
                    );
                  })}
                </Group>

                {publicOrgLoading ? (
                  <Stack gap="sm">
                    <Skeleton height={72} radius="md" />
                    <Skeleton height={72} radius="md" />
                  </Stack>
                ) : publicOrgs.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No organizations found. Try a different search term or category.
                  </Text>
                ) : (
                  <Stack gap="sm">
                    {publicOrgs.map((org) => (
                      <DiscoveryOrgCard
                        key={org.id}
                        org={org}
                        onClick={() => router.push(`/organizations/${org.id}?source=discover`)}
                      />
                    ))}
                  </Stack>
                )}
              </Paper>
            )}
          </Stack>
        )}

        {/* Floating FAB to add contact */}
        <ActionIcon
          size={56} color="credentis" radius="xl" variant="filled"
          style={{ position: 'fixed', bottom: 90, right: 20, zIndex: 10, boxShadow: 'light-dark(0 4px 12px color-mix(in srgb, var(--mantine-color-black) 15%, transparent), 0 6px 18px color-mix(in srgb, var(--mantine-color-black) 45%, transparent))' }}
          onClick={() => setShowCreate(true)}
        >
          <IconPlus size={24} />
        </ActionIcon>
      </Stack>

      {/* Main Detail Drawer */}
      <BottomSheet
        opened={!!selected} onClose={() => { setSelected(null); setShowPay(false); setShowVC(false); setPayLinkResult(null); setPayLinkRouteToken(null); }}
        title={selected?.name ?? 'Contact'}
      >
        {selected && !showPay && !showVC && (
          <Stack gap="md" pb="lg">
            <Center><Avatar size={64} radius="xl" color="credentis">{getInitials(selected.name)}</Avatar></Center>
            <Divider />
            <Stack gap="sm">
              {selected.phone && (
                <Group gap="sm">
                  <ThemeIcon size={32} radius="xl" variant="light" color="credentis"><IconPhone size={16} /></ThemeIcon>
                  <Box style={{ flex: 1 }}>
                    <Text size="xs" c="dimmed">Phone</Text>
                    <Text size="sm" fw={500}>{selected.phone}</Text>
                  </Box>
                  <ActionIcon color="green" variant="light" onClick={() => shareWhatsApp(selected.phone!, 'Hello!')}>
                    <IconBrandWhatsapp size={18} />
                  </ActionIcon>
                </Group>
              )}
              {selected.email && (
                <Group gap="sm">
                  <ThemeIcon size={32} radius="xl" variant="light" color="credentis"><IconMail size={16} /></ThemeIcon>
                  <Box><Text size="xs" c="dimmed">Email</Text><Text size="sm" fw={500}>{selected.email}</Text></Box>
                </Group>
              )}
              {selected.did && (
                <Group gap="sm" align="flex-start">
                  <ThemeIcon size={32} radius="xl" variant="light" color="indigo"><IconShieldCheck size={16} /></ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" c="dimmed">Decentralised Identity (DID)</Text>
                    <Text size="xs" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }} c="indigo">{selected.did}</Text>
                  </Box>
                </Group>
              )}
            </Stack>
            <Divider />
            {selected.sourceType === 'membership-org' && (
              <Alert icon={<IconUsers size={16} />} color="indigo" variant="light">
                This is an organisation membership contact. Payment links and credential offers are managed in org context.
              </Alert>
            )}
            <Stack gap="sm">
              <Button fullWidth size="lg" leftSection={<IconLink size={18} />} onClick={() => setShowPay(true)} disabled={selected.sourceType === 'membership-org'}>
                Pay
              </Button>
              <Button fullWidth size="lg" color="gray" variant="light" leftSection={<IconChevronRight size={18} />} onClick={() => setShowPay(true)}>
                View
              </Button>
              {!isHolder && (
                <Button fullWidth size="lg" color="violet" variant="light" leftSection={<IconSend size={18} />} onClick={() => setShowVC(true)} disabled={selected.sourceType === 'membership-org'}>
                  Issue Credential Offer
                </Button>
              )}
              <Button fullWidth size="lg" color="blue" variant="light" leftSection={<IconUsers size={18} />} onClick={() => window.location.assign('/organizations')}>
                Request Quote/Invoice
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Inline Pay UI */}
        {selected && showPay && (
          <Stack gap="md" pb="lg">
            <Group>
              <ActionIcon onClick={() => { setShowPay(false); setPayLinkResult(null); }}><IconChevronRight style={{ transform: 'rotate(180deg)' }} /></ActionIcon>
              <Text fw={600}>Payment Link for {selected.name}</Text>
            </Group>
            {payLinkResult ? (
              <Stack gap="sm">
                {payLinkRouteToken && (
                  <Button fullWidth onClick={() => router.push(`/pay/${encodeURIComponent(payLinkRouteToken)}`)}>
                    Open In-App Checkout
                  </Button>
                )}
                <Paper p="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" mb={4} fw={600}>PAYMENT URL</Text>
                  <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>{payLinkResult}</Text>
                </Paper>
                <Group grow>
                  <CopyButton value={payLinkResult}>
                    {({ copied, copy }) => (
                      <Button variant={copied ? 'filled' : 'light'} color={copied ? 'green' : 'blue'} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
                    )}
                  </CopyButton>
                  {selected.phone && (
                    <Button variant="light" color="green" leftSection={<IconBrandWhatsapp size={18} />} onClick={() => shareWhatsApp(selected.phone!, `Please pay: ${payLinkResult}`)}>WhatsApp</Button>
                  )}
                </Group>
              </Stack>
            ) : (
              <>
                <TextInput label="Description" required placeholder="e.g. Service fee" value={payForm.description} onChange={e => setPayForm({ ...payForm, description: e.currentTarget.value })} />
                <Group grow>
                  <TextInput label="Amount" required type="number" placeholder="0.00" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.currentTarget.value })} />
                  <Select label="Currency" value={payForm.currency} onChange={v => setPayForm({ ...payForm, currency: v ?? 'USD' })} data={['USD', 'ZWL', 'ZIG']} />
                </Group>
                <Button fullWidth onClick={handleCreatePaymentLink} loading={paying} disabled={!payForm.description || !payForm.amount}>Generate Link</Button>
              </>
            )}
          </Stack>
        )}

        {/* Inline VC UI */}
        {selected && showVC && !isHolder && (
          <Stack gap="md" pb="lg">
            <Group>
              <ActionIcon onClick={() => setShowVC(false)}><IconChevronRight style={{ transform: 'rotate(180deg)' }} /></ActionIcon>
              <Text fw={600}>Issue Credential to {selected.name}</Text>
            </Group>
            <Select label="Credential Type" value={vcForm.type} onChange={v => setVcForm({ ...vcForm, type: v ?? '' })} data={['EmploymentCredential', 'MemberCredential']} />
            <TextInput label="Role / Title" placeholder="e.g. Sales Manager" value={vcForm.role} onChange={e => setVcForm({ ...vcForm, role: e.currentTarget.value })} />
            <Button fullWidth color="violet" onClick={handleIssueVC} loading={issuing}>Send Offer</Button>
          </Stack>
        )}
      </BottomSheet>

      {/* Create Contact Drawer */}
      <BottomSheet
        opened={showCreate} onClose={() => setShowCreate(false)}
        title="Add Contact"
      >
        <Stack gap="md" pb="lg">
          <TextInput label="Name" required value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.currentTarget.value })} />
          <TextInput label="Phone" placeholder="+263..." value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.currentTarget.value })} />
          <TextInput label="Email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.currentTarget.value })} />
          <Select
            label="Contact scope"
            value={createForm.contactScope}
            onChange={(value) => setCreateForm({ ...createForm, contactScope: (value as 'internal' | 'external') || 'external' })}
            data={[
              { value: 'external', label: 'External (customers, suppliers, parents)' },
              { value: 'internal', label: 'Internal (staff, owner, team)' },
            ]}
          />
          <Checkbox
            checked={createForm.inviteToWallet}
            onChange={(event) => setCreateForm({ ...createForm, inviteToWallet: event.currentTarget.checked })}
            label="Send wallet-link invite after saving"
          />
          <Button fullWidth onClick={handleCreateContact} loading={creating} disabled={!createForm.name}>Save Contact</Button>
        </Stack>
      </BottomSheet>
    </AppShellMobile>
  );
}
