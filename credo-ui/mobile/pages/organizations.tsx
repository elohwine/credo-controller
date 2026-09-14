import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Text, Title, Group, Button, Badge, Paper, ThemeIcon, TextInput, Tabs, Card, Skeleton, SimpleGrid, Divider, Avatar, Select, Modal, Switch, NumberInput
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBuilding, IconSearch, IconCheck, IconStar, IconChevronRight, IconShieldCheck, IconPhone, IconSchool, IconBuildingBank, IconTruck, IconHeartbeat, IconPlus, IconUsers, IconSettingsAutomation
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { getActiveOrgLabel, getContextMode, getPreferredToken, getWalletToken, isAuthenticated } from '@/lib/auth';
import api, { safeArray } from '@/lib/api';

interface Organization {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  category: string;
  trustScore: number;
  verificationStatus: string;
  availableServices: number;
  role?: string;
}

interface MembershipOrg {
  orgTenantId?: string;
  id?: string;
  name?: string;
  role?: string;
  domain?: string;
  issuerDid?: string;
  memberCount?: number;
}

interface ContactSummary {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  did?: string;
  walletTenantId?: string;
  contactScope: 'internal' | 'external';
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  government: { label: 'Government', icon: IconBuilding, color: 'indigo' },
  education: { label: 'Education', icon: IconSchool, color: 'grape' },
  telecom: { label: 'Telecom', icon: IconPhone, color: 'cyan' },
  finance: { label: 'Finance', icon: IconBuildingBank, color: 'teal' },
  supplier: { label: 'Suppliers', icon: IconTruck, color: 'orange' },
  healthcare: { label: 'Healthcare', icon: IconHeartbeat, color: 'pink' },
};

function OrganizationCard({ org, onClick, onAddContact }: { org: Organization; onClick: () => void; onAddContact?: () => void }) {
  const Icon = CATEGORY_CONFIG[org.category]?.icon || IconBuilding;
  const color = CATEGORY_CONFIG[org.category]?.color || 'gray';

  return (
    <Card p="md" radius="md" withBorder onClick={onClick} style={{ cursor: 'pointer' }}>
      <Group wrap="nowrap">
        <ThemeIcon size="xl" radius="md" variant="light" color={color}>
          {org.logo ? (
            <Avatar src={org.logo} size="md" radius="md" />
          ) : (
            <Icon size={28} />
          )}
        </ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={600} style={{ flex: 1 }} lineClamp={1}>
              {org.name}
            </Text>
            {org.verificationStatus === 'verified' && (
              <ThemeIcon size="sm" color="blue" variant="light" radius="xl">
                <IconShieldCheck size={12} />
              </ThemeIcon>
            )}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {org.description}
          </Text>
          <Group gap="xs" mt={4}>
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
                <Text size="xs" fw={500}>
                  {org.trustScore.toFixed(1)}
                </Text>
              </Group>
            )}
          </Group>
        </Box>
        <Group gap={6} wrap="nowrap">
          {onAddContact && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={12} />}
              onClick={(event) => {
                event.stopPropagation();
                onAddContact();
              }}
            >
              Add
            </Button>
          )}
          <IconChevronRight size={18} color="light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-2))" />
        </Group>
      </Group>
    </Card>
  );
}

function CategoryButton({ category, icon: Icon, label, color, active, onClick }: any) {
  return (
    <Paper
      p="sm"
      radius="md"
      withBorder
      style={{
        cursor: 'pointer',
        borderColor: active ? `var(--mantine-color-${color}-6)` : undefined,
        backgroundColor: active ? `light-dark(var(--mantine-color-${color}-0), var(--mantine-color-${color}-9))` : undefined,
      }}
      onClick={onClick}
    >
      <Stack gap={4} align="center">
        <ThemeIcon size="lg" radius="md" variant="light" color={active ? color : 'gray'}>
          <Icon size={20} />
        </ThemeIcon>
        <Text size="xs" fw={active ? 600 : 500} c={active ? color : undefined}>
          {label}
        </Text>
      </Stack>
    </Paper>
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('my-orgs');
  const [myOrgs, setMyOrgs] = useState<Organization[]>([]);
  const [publicOrgs, setPublicOrgs] = useState<Organization[]>([]);
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactScopeFilter, setContactScopeFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [showDiscoveryAddModal, setShowDiscoveryAddModal] = useState(false);
  const [creatingDiscoveryContact, setCreatingDiscoveryContact] = useState(false);
  const [selectedDiscoveryOrg, setSelectedDiscoveryOrg] = useState<Organization | null>(null);
  const [discoveryInviteToWallet, setDiscoveryInviteToWallet] = useState(false);
  const [discoveryInviteExpiryHours, setDiscoveryInviteExpiryHours] = useState<number>(168);
  const [discoveryInviteClaimUrl, setDiscoveryInviteClaimUrl] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    contactScope: 'external' as 'internal' | 'external',
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const isOrgContext = getContextMode() === 'org';
  const activeOrgLabel = getActiveOrgLabel();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=/organizations');
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    loadOrganizations();
  }, [checkingAuth, activeTab, selectedCategory]);

  useEffect(() => {
    if (checkingAuth) return;
    void loadContacts();
  }, [checkingAuth]);

  const mapMembershipsToOrganizations = (memberships: MembershipOrg[]): Organization[] => {
    const mapped = memberships
      .filter((m) => !!(m.orgTenantId || m.id))
      .map((m) => ({
        id: m.orgTenantId || m.id || '',
        name: m.name || 'Unknown Organization',
        description: m.domain ? `Domain: ${m.domain}` : (m.issuerDid ? `Issuer: ${m.issuerDid}` : undefined),
        category: 'supplier',
        trustScore: 0,
        verificationStatus: 'verified',
        availableServices: typeof m.memberCount === 'number' ? m.memberCount : 0,
        role: m.role,
      }));

    return Array.from(new Map(mapped.map((org) => [org.id, org])).values());
  };

  const loadOrganizationsFromCache = (): Organization[] => {
    try {
      const cached = JSON.parse(localStorage.getItem('credoOrganizations') || '[]');
      if (!Array.isArray(cached)) return [];
      return mapMembershipsToOrganizations(cached as MembershipOrg[]);
    } catch {
      return [];
    }
  };

  const loadOrganizations = async () => {
    setLoading(true);
    try {
      const token = getWalletToken();
      if (!token) {
        router.push('/login');
        return;
      }

      if (activeTab === 'my-orgs') {
        const response = await api.get('/api/organizations', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const orgs = mapMembershipsToOrganizations(Array.isArray(response.data) ? response.data : []);
        setMyOrgs(orgs.length > 0 ? orgs : loadOrganizationsFromCache());
      } else {
        const params: any = { verifiedOnly: true };
        if (selectedCategory) {
          params.category = selectedCategory;
        }
        const response = await api.get('/api/discovery/organizations', { params });
        setPublicOrgs(response.data || []);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error?.message ?? 'Failed to load organizations';
      if (activeTab === 'my-orgs') {
        setMyOrgs(loadOrganizationsFromCache());
        notifications.show({ title: 'My Orgs', message: msg, color: 'red' });
      } else {
        notifications.show({ title: 'Discovery Error', message: msg, color: 'red' });
        setPublicOrgs([]);
      }
      console.error('Failed to load organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      if (!isOrgContext) {
        setContacts([]);
        return;
      }

      const token = getPreferredToken();
      if (!token) {
        setContacts([]);
        return;
      }

      const [externalRes, internalRes] = await Promise.all([
        api.get('/api/contacts', {
          params: { contactScope: 'external' },
          headers: { Authorization: `Bearer ${token}` },
        }),
        api.get('/api/contacts', {
          params: { contactScope: 'internal' },
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const merged = [
        ...safeArray<any>(externalRes.data?.contacts ?? externalRes.data),
        ...safeArray<any>(internalRes.data?.contacts ?? internalRes.data),
      ];

      const deduped = Array.from(new Map(merged.map((entry) => [entry.id, entry])).values());
      setContacts(deduped.map((entry: any) => ({
        id: entry.id,
        name: entry.name || 'Unknown Contact',
        phone: entry.phone || undefined,
        email: entry.email || undefined,
        did: entry.did || undefined,
        walletTenantId: entry.walletTenantId || undefined,
        contactScope: entry.contactScope === 'internal' ? 'internal' : 'external',
      })));
    } catch {
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleCreateContact = async () => {
    if (!contactForm.name.trim()) return;
    const token = getPreferredToken();
    if (!token) return;

    setCreatingContact(true);
    try {
      await api.post('/api/contacts', {
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim() || undefined,
        email: contactForm.email.trim() || undefined,
        contactScope: contactForm.contactScope,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      notifications.show({ title: 'Contact Added', message: 'Contact saved successfully.', color: 'green' });
      setShowCreateContact(false);
      setContactForm({ name: '', phone: '', email: '', contactScope: 'external' });
      await loadContacts();
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error?.message ?? 'Failed to create contact';
      notifications.show({ title: 'Create Contact Failed', message: msg, color: 'red' });
    } finally {
      setCreatingContact(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const response = await api.get('/api/discovery/search', {
        params: { q: searchQuery, category: selectedCategory },
      });
      setPublicOrgs(response.data || []);
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error?.message ?? 'Search failed';
      notifications.show({ title: 'Search Failed', message: msg, color: 'red' });
      setPublicOrgs([]);
    } finally {
      setLoading(false);
    }
  };

  const viewOrganization = (org: Organization) => {
    const source = activeTab === 'my-orgs' ? 'my-orgs' : 'discover';
    router.push(`/organizations/${org.id}?source=${encodeURIComponent(source)}`);
  };

  const openDiscoveryAddModal = (org: Organization) => {
    setSelectedDiscoveryOrg(org);
    setDiscoveryInviteToWallet(false);
    setDiscoveryInviteExpiryHours(168);
    setDiscoveryInviteClaimUrl(null);
    setShowDiscoveryAddModal(true);
  };

  const handleAddDiscoveryOrgAsContact = async () => {
    if (!selectedDiscoveryOrg) return;
    const token = getPreferredToken();
    if (!token) {
      notifications.show({ title: 'Sign in required', message: 'Switch to an org context to add contacts.', color: 'red' });
      return;
    }

    setCreatingDiscoveryContact(true);
    setDiscoveryInviteClaimUrl(null);
    try {
      const [profileRes, storefrontRes] = await Promise.all([
        api.get(`/api/discovery/organizations/${encodeURIComponent(selectedDiscoveryOrg.id)}`),
        api.get(`/api/discovery/organizations/${encodeURIComponent(selectedDiscoveryOrg.id)}/storefront`),
      ]);

      const profile = profileRes.data || {};
      const storefront = storefrontRes.data || {};
      const walletTenantId = String(storefront.tenantId || '').trim() || undefined;
      const did = String(storefront.did || '').trim() || undefined;

      const existing = contacts.find((contact) => walletTenantId && contact.walletTenantId === walletTenantId);
      if (existing) {
        notifications.show({
          title: 'Already linked',
          message: `${selectedDiscoveryOrg.name} is already in your contacts.`,
          color: 'blue',
        });
        setShowDiscoveryAddModal(false);
        return;
      }

      const payload = {
        name: String(profile.displayName || selectedDiscoveryOrg.name || 'Organization').trim(),
        phone: String(profile.contactPhone || '').trim() || undefined,
        email: String(profile.contactEmail || '').trim() || undefined,
        did,
        walletTenantId,
        contactScope: 'external' as const,
        notes: `Added from mobile discovery (${selectedDiscoveryOrg.id})`,
        inviteToWallet: discoveryInviteToWallet,
        inviteExpiryHours: discoveryInviteToWallet ? discoveryInviteExpiryHours : undefined,
      };

      const created = await api.post('/api/contacts', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setDiscoveryInviteClaimUrl(created?.data?.invite?.claimUrl || null);
      await loadContacts();

      notifications.show({
        title: 'Contact Added',
        message: `${payload.name} is now in your contacts.`,
        color: 'green',
      });

      if (!created?.data?.invite?.claimUrl) {
        setShowDiscoveryAddModal(false);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error?.message ?? 'Failed to add discovery contact';
      notifications.show({ title: 'Add Contact Failed', message: msg, color: 'red' });
    } finally {
      setCreatingDiscoveryContact(false);
    }
  };

  if (checkingAuth) {
    return (
      <AppShellMobile>
        <Box p="md">
          <Skeleton height={40} mb="md" />
          <Skeleton height={300} />
        </Box>
      </AppShellMobile>
    );
  }

  return (
    <AppShellMobile>
      <Box>
        {/* Header */}
        <Box
          p="md"
          style={{
            background: 'light-dark(color-mix(in srgb, var(--mantine-color-white) 74%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 78%, transparent))',
            borderBottom: '1px solid light-dark(color-mix(in srgb, var(--mantine-color-gray-4) 20%, transparent), color-mix(in srgb, var(--mantine-color-white) 8%, transparent))',
            backdropFilter: 'blur(12px) saturate(150%)',
          }}
        >
          <Title order={3} style={{ marginBottom: 8 }}>
            Orgs + Contacts
          </Title>
          <Text size="sm" c="dimmed">
            Switch between organizations and contacts in one place
          </Text>
        </Box>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v)} variant="pills" px="md" pt="md">
          <Tabs.List grow>
            <Tabs.Tab value="my-orgs">My Organizations</Tabs.Tab>
            <Tabs.Tab value="contacts">Contacts ({contacts.length})</Tabs.Tab>
            <Tabs.Tab value="discover">Discover Services</Tabs.Tab>
          </Tabs.List>

          {/* My Organizations Tab */}
          <Tabs.Panel value="my-orgs" pt="md">
            <Stack gap="md">
              {loading ? (
                <>
                  <Skeleton height={80} radius="md" />
                  <Skeleton height={80} radius="md" />
                  <Skeleton height={80} radius="md" />
                </>
              ) : myOrgs.length === 0 ? (
                <Paper p="xl" radius="md" withBorder style={{ textAlign: 'center' }}>
                  <ThemeIcon size={60} radius="xl" variant="light" color="gray" mx="auto" mb="md">
                    <IconBuilding size={32} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} mb={4}>
                    No Organizations Yet
                  </Text>
                  <Text size="xs" c="dimmed" mb="md">
                    Connect with organizations to request services
                  </Text>
                  <Button size="sm" onClick={() => setActiveTab('discover')}>
                    Discover Services
                  </Button>
                </Paper>
              ) : (
                <Stack gap="sm">
                  {myOrgs.map((org) => (
                    <OrganizationCard key={org.id} org={org} onClick={() => viewOrganization(org)} />
                  ))}
                </Stack>
              )}

              <Divider my="md" />
              <SimpleGrid cols={2} spacing="sm">
                <Button
                  variant="light"
                  leftSection={<IconPlus size={18} />}
                  onClick={() => setActiveTab('discover')}
                >
                  Add from Discovery
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconSettingsAutomation size={18} />}
                  onClick={() => router.push('/settings/org')}
                >
                  Manual Onboarding
                </Button>
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>

          {/* Discover Services Tab */}
          <Tabs.Panel value="discover" pt="md">
            <Stack gap="md">
              {/* Search Bar */}
              <TextInput
                placeholder="Search organizations or services..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                rightSection={
                  searchQuery && (
                    <Button size="xs" onClick={handleSearch}>
                      Search
                    </Button>
                  )
                }
              />

              {/* Category Pills */}
              <Box>
                <Text size="sm" fw={500} mb="xs">
                  Categories
                </Text>
                <SimpleGrid cols={3} spacing="xs">
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <CategoryButton
                      key={key}
                      category={key}
                      icon={config.icon}
                      label={config.label}
                      color={config.color}
                      active={selectedCategory === key}
                      onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                    />
                  ))}
                </SimpleGrid>
              </Box>

              {/* Public Organizations List */}
              {loading ? (
                <>
                  <Skeleton height={80} radius="md" />
                  <Skeleton height={80} radius="md" />
                  <Skeleton height={80} radius="md" />
                </>
              ) : publicOrgs.length === 0 ? (
                <Paper p="xl" radius="md" withBorder style={{ textAlign: 'center' }}>
                  <ThemeIcon size={60} radius="xl" variant="light" color="gray" mx="auto" mb="md">
                    <IconSearch size={32} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} mb={4}>
                    No Organizations Found
                  </Text>
                  <Text size="xs" c="dimmed">
                    Try a different category or search term
                  </Text>
                </Paper>
              ) : (
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={500} c="dimmed">
                      {publicOrgs.length} {publicOrgs.length === 1 ? 'organization' : 'organizations'} found
                    </Text>
                    {selectedCategory && (
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => setSelectedCategory(null)}
                      >
                        Clear filter
                      </Button>
                    )}
                  </Group>
                  {publicOrgs.map((org) => (
                    <OrganizationCard
                      key={org.id}
                      org={org}
                      onClick={() => viewOrganization(org)}
                      onAddContact={isOrgContext ? () => openDiscoveryAddModal(org) : undefined}
                    />
                  ))}
                </Stack>
              )}

              <Paper p="sm" radius="md" withBorder>
                <Group justify="space-between" wrap="nowrap">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600}>Organization not listed?</Text>
                    <Text size="xs" c="dimmed">Use the manual onboarding flow to create and configure your org directly.</Text>
                  </Box>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconSettingsAutomation size={14} />}
                    onClick={() => router.push('/settings/org')}
                  >
                    Manual
                  </Button>
                </Group>
              </Paper>
            </Stack>
          </Tabs.Panel>

          {/* Contacts Tab */}
          <Tabs.Panel value="contacts" pt="md">
            <Stack gap="md">
              <Paper p="md" radius="md" withBorder>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                    <ThemeIcon size="lg" radius="md" variant="light" color={isOrgContext ? 'teal' : 'indigo'}>
                      <IconUsers size={18} />
                    </ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                      <Text fw={600} size="sm">Contacts Hub</Text>
                      <Text size="xs" c="dimmed">
                        {isOrgContext
                          ? `Active org: ${activeOrgLabel || 'Current org'} · invite and manage internal/external contacts`
                          : 'Switch to an organization context to view and manage org contacts'}
                      </Text>
                    </Box>
                  </Group>
                  {isOrgContext && (
                    <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setShowCreateContact(true)}>
                      Add
                    </Button>
                  )}
                </Group>
              </Paper>

              {isOrgContext && (
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group gap={6}>
                    <Button
                      size="xs"
                      variant={contactScopeFilter === 'all' ? 'filled' : 'light'}
                      onClick={() => setContactScopeFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      size="xs"
                      variant={contactScopeFilter === 'internal' ? 'filled' : 'light'}
                      onClick={() => setContactScopeFilter('internal')}
                    >
                      Internal
                    </Button>
                    <Button
                      size="xs"
                      variant={contactScopeFilter === 'external' ? 'filled' : 'light'}
                      onClick={() => setContactScopeFilter('external')}
                    >
                      External
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed">{contacts.filter((c) => contactScopeFilter === 'all' || c.contactScope === contactScopeFilter).length} shown</Text>
                </Group>
              )}

              {loadingContacts ? (
                <>
                  <Skeleton height={70} radius="md" />
                  <Skeleton height={70} radius="md" />
                </>
              ) : !isOrgContext ? (
                <Paper p="xl" radius="md" withBorder style={{ textAlign: 'center' }}>
                  <ThemeIcon size={60} radius="xl" variant="light" color="gray" mx="auto" mb="md">
                    <IconUsers size={32} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} mb={4}>No contacts in personal context</Text>
                  <Text size="xs" c="dimmed">
                    Use account switcher to enter an organization, then manage contacts in this tab.
                  </Text>
                </Paper>
              ) : contacts.length === 0 ? (
                <Paper p="xl" radius="md" withBorder style={{ textAlign: 'center' }}>
                  <ThemeIcon size={60} radius="xl" variant="light" color="gray" mx="auto" mb="md">
                    <IconUsers size={32} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} mb={4}>No contacts yet</Text>
                  <Text size="xs" c="dimmed" mb="md">
                    Add contacts to share invites, payment links, and credential actions.
                  </Text>
                  <Button size="sm" onClick={() => setShowCreateContact(true)}>
                    Add First Contact
                  </Button>
                </Paper>
              ) : (
                <Stack gap="sm">
                  {contacts
                    .filter((contact) => contactScopeFilter === 'all' || contact.contactScope === contactScopeFilter)
                    .map((contact) => (
                    <Card key={contact.id} p="sm" radius="md" withBorder>
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Box style={{ minWidth: 0, flex: 1 }}>
                          <Group gap={8} wrap="nowrap">
                            <Text size="sm" fw={600} lineClamp={1}>{contact.name}</Text>
                            <Badge size="xs" variant="light" color={contact.contactScope === 'internal' ? 'indigo' : 'teal'}>
                              {contact.contactScope}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" lineClamp={1}>{contact.phone || contact.email || 'No phone/email'}</Text>
                        </Box>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Modal
          opened={showCreateContact}
          onClose={() => setShowCreateContact(false)}
          title="Add Contact"
          centered
        >
          <Stack>
            <TextInput
              label="Name"
              required
              value={contactForm.name}
              onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.currentTarget.value }))}
            />
            <TextInput
              label="Phone"
              placeholder="+263..."
              value={contactForm.phone}
              onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.currentTarget.value }))}
            />
            <TextInput
              label="Email"
              value={contactForm.email}
              onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.currentTarget.value }))}
            />
            <Select
              label="Scope"
              value={contactForm.contactScope}
              data={[
                { value: 'external', label: 'External' },
                { value: 'internal', label: 'Internal' },
              ]}
              onChange={(value) => setContactForm((prev) => ({ ...prev, contactScope: (value as 'internal' | 'external') || 'external' }))}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setShowCreateContact(false)}>Cancel</Button>
              <Button onClick={handleCreateContact} loading={creatingContact} disabled={!contactForm.name.trim()}>
                Save Contact
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={showDiscoveryAddModal}
          onClose={() => setShowDiscoveryAddModal(false)}
          title="Add Organization Contact"
          centered
        >
          <Stack>
            <Paper p="sm" radius="md" withBorder>
              <Text size="sm" fw={600}>{selectedDiscoveryOrg?.name || 'Organization'}</Text>
              <Text size="xs" c="dimmed">From discovery directory</Text>
            </Paper>

            <Switch
              checked={discoveryInviteToWallet}
              onChange={(event) => setDiscoveryInviteToWallet(event.currentTarget.checked)}
              label="Send wallet invite request"
              description="Create a claim link the contact can use to link their wallet."
            />

            {discoveryInviteToWallet && (
              <NumberInput
                label="Invite expiry (hours)"
                min={1}
                max={720}
                value={discoveryInviteExpiryHours}
                onChange={(value) => setDiscoveryInviteExpiryHours(typeof value === 'number' ? value : 168)}
              />
            )}

            {discoveryInviteClaimUrl && (
              <Paper p="sm" radius="md" withBorder>
                <Text size="xs" c="dimmed" mb={4}>Invite claim URL</Text>
                <Text size="xs" style={{ wordBreak: 'break-all' }}>{discoveryInviteClaimUrl}</Text>
              </Paper>
            )}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setShowDiscoveryAddModal(false)}>Cancel</Button>
              <Button onClick={handleAddDiscoveryOrgAsContact} loading={creatingDiscoveryContact}>
                Add Contact
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Bottom Padding for Nav */}
        <Box style={{ height: 80 }} />
      </Box>
    </AppShellMobile>
  );
}
