import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Stack, Title, Text, Box, Divider, Button, Group, Checkbox, TextInput, Alert, Loader, Center,
  Paper, Badge, Collapse, Stepper, SimpleGrid, ThemeIcon, Card, ColorInput, ScrollArea, Select,
  Modal,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBuilding, IconCheck, IconPlus, IconSettingsAutomation, IconCreditCard, IconCertificate,
  IconPalette, IconRocket, IconArrowLeft, IconArrowRight, IconShieldCheck, IconBuildingStore,
  IconCash, IconQrcode, IconDeviceMobile, IconBuildingBank, IconReceipt,
  IconTruck, IconSchool, IconUsers, IconClipboardList, IconShoppingCart, IconUserPlus, IconTrash,
  IconEdit,
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import BottomSheet from '@/components/shared/BottomSheet';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api, { safeArray } from '@/lib/api';
import { getActiveOrgLabel, getActiveOrgId, getWalletToken, getPreferredToken, applyOrgContext } from '@/lib/auth';

// ── Capability & template types ──

interface CapabilityInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  templates: string[];
}

interface TemplateDefinition {
  id: string;
  name: string;
  workflowType: string;
  sector: string;
  enabled?: boolean;
  steps?: { description: string }[];
  paymentModes: string[];
  credentialPolicy: { outputVCs: string[] };
  reconciliationPolicy: { mode: string };
  evidencePolicy?: any;
  description?: string;
}

function inferTemplateSector(raw: any): string {
  const explicit = String(raw?.sector || '').trim().toLowerCase();
  if (['ecommerce', 'education', 'cash', 'field_execution', 'custom'].includes(explicit)) {
    return explicit;
  }

  const id = String(raw?.id || raw?.workflowType || '').toLowerCase();
  if (id.includes('education')) return 'education';
  if (id.includes('cash-counter') || id.includes('cash_counter')) return 'cash';
  if (id.includes('field') || id.includes('fept')) return 'field_execution';

  const category = String(raw?.category || '').toLowerCase();
  if (category === 'ecommerce') return 'ecommerce';
  return 'custom';
}

function normalizeCapability(raw: any): CapabilityInfo {
  const templates = Array.isArray(raw?.templates)
    ? raw.templates
    : Array.isArray(raw?.associatedTemplates)
      ? raw.associatedTemplates
      : [];

  return {
    id: String(raw?.id || ''),
    label: String(raw?.label || raw?.name || raw?.id || 'Capability'),
    description: String(raw?.description || ''),
    icon: String(raw?.icon || 'settings'),
    category: String(raw?.category || 'general').toLowerCase(),
    templates: templates.filter((value: unknown): value is string => typeof value === 'string'),
  };
}

function normalizeTemplate(raw: any): TemplateDefinition {
  const paymentModes = Array.isArray(raw?.paymentModes)
    ? raw.paymentModes.filter((value: unknown): value is string => typeof value === 'string')
    : [];

  const outputVCs = Array.isArray(raw?.credentialPolicy?.outputVCs)
    ? raw.credentialPolicy.outputVCs
    : Array.isArray(raw?.outputVCs)
      ? raw.outputVCs
      : [];

  const steps = Array.isArray(raw?.steps)
    ? raw.steps
      .map((step: any) => ({ description: String(step?.description || step?.action || '') }))
      .filter((step: { description: string }) => step.description.length > 0)
    : [];

  return {
    id: String(raw?.id || ''),
    name: String(raw?.name || raw?.id || 'Workflow Template'),
    workflowType: String(raw?.workflowType || raw?.id || ''),
    sector: inferTemplateSector(raw),
    enabled: raw?.enabled !== false,
    steps,
    paymentModes,
    credentialPolicy: {
      outputVCs: outputVCs.filter((value: unknown): value is string => typeof value === 'string'),
    },
    reconciliationPolicy: {
      mode: String(raw?.reconciliationPolicy?.mode || 'automatic'),
    },
    evidencePolicy: raw?.evidencePolicy || {},
    description: typeof raw?.description === 'string' ? raw.description : undefined,
  };
}

// ── Icon mapping (reuse Tabler icons already imported) ──

const CAPABILITY_ICON_MAP: Record<string, React.ReactNode> = {
  receipt: <IconReceipt size={22} />,
  IconReceipt: <IconReceipt size={22} />,
  cash: <IconCash size={22} />,
  truck: <IconTruck size={22} />,
  school: <IconSchool size={22} />,
  users: <IconUsers size={22} />,
  clipboard: <IconClipboardList size={22} />,
  cart: <IconShoppingCart size={22} />,
  credit_card: <IconCreditCard size={22} />,
  IconCreditCard: <IconCreditCard size={22} />,
  shield: <IconShieldCheck size={22} />,
  building: <IconBuilding size={22} />,
  IconBuilding: <IconBuilding size={22} />,
  IconBuildingStore: <IconBuildingStore size={22} />,
  IconBuildingBank: <IconBuildingBank size={22} />,
};

function resolveCapabilityIcon(iconKey: string) {
  return CAPABILITY_ICON_MAP[iconKey] || <IconSettingsAutomation size={22} />;
}

const CATEGORY_COLORS: Record<string, string> = {
  finance: 'teal',
  operations: 'blue',
  governance: 'violet',
  commerce: 'orange',
};

// ── Payment method options (reuse from portal patterns) ──

const PAYMENT_OPTIONS = [
  { value: 'mobile_money', label: 'Mobile Money', icon: <IconDeviceMobile size={18} />, color: 'green' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: <IconBuildingBank size={18} />, color: 'blue' },
  { value: 'cash', label: 'Cash', icon: <IconCash size={18} />, color: 'orange' },
  { value: 'qr_code', label: 'QR Code', icon: <IconQrcode size={18} />, color: 'violet' },
];

// ── Org list types ──

interface OrgOption {
  value: string;
  label: string;
  sector?: string;
}

interface StorefrontSummary {
  orgId: string;
  tenantId: string;
  displayName: string;
  category?: string;
  verificationStatus?: string;
  trustScore?: number;
  isPublic?: boolean;
  paymentRails?: string[];
  services?: Array<{ id: string }>;
  catalogItems?: Array<{ id: string }>;
}

interface OrgMemberActor {
  userId: string;
  role: string;
  walletTenantId?: string;
}

interface WorkflowActorDefault {
  id: string;
  workflowType: string;
  stageAction: string;
  defaultRole?: string;
  defaultUserId?: string;
  defaultWalletTenantId?: string;
  enabled: boolean;
}

type ReadinessRequirement = 'mandatory' | 'conditional' | 'recommended';
type ReadinessStatus = 'ready' | 'needs_attention' | 'optional';
type ReadinessDomain = 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations';

interface ReadinessItem {
  key: string;
  title: string;
  domain: ReadinessDomain;
  requirement: ReadinessRequirement;
  status: ReadinessStatus;
  reason?: string;
}

interface OrganizationReadiness {
  orgTenantId: string;
  orgName: string;
  readinessPercent: number;
  readinessState: 'ready' | 'in_progress' | 'blocked';
  items: ReadinessItem[];
  nextActions: string[];
}

const STORE_PAYMENT_RAIL_OPTIONS = [
  { value: 'AcceptsEcoCash', label: 'EcoCash' },
  { value: 'AcceptsZipit', label: 'ZIPIT' },
  { value: 'AcceptsClicknPay', label: 'ClicknPay' },
  { value: 'AcceptsUsdCash', label: 'USD Cash' },
];

const AP_ACTOR_ACTIONS = [
  { value: 'present_payment_proof', label: 'Present payment proof' },
  { value: 'record_payment', label: 'Record payment' },
  { value: 'acknowledge_remittance', label: 'Acknowledge remittance' },
  { value: 'issue_receipt_vc', label: 'Issue receipt VC' },
  { value: 'mark_disputed', label: 'Mark disputed' },
  { value: 'resolve_dispute', label: 'Resolve dispute' },
];

export default function OrgSettingsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create org flow
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  // Store basics
  const [storefront, setStorefront] = useState<StorefrontSummary | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingRails, setSavingRails] = useState(false);
  const [storePaymentRails, setStorePaymentRails] = useState<string[]>([]);
  const [storeIsPublic, setStoreIsPublic] = useState(true);

  // Member management
  const [memberList, setMemberList] = useState<Array<{ userId: string; role: string; walletTenantId?: string; status: string }>>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<string | null>('approver');
  const [inviting, setInviting] = useState(false);

  const fetchMembers = useCallback(async (orgId: string) => {
    const token = getPreferredToken();
    if (!token || !orgId) return;
    setMembersLoading(true);
    try {
      const res = await api.get(`/api/organizations/${orgId}/members`, { headers: { Authorization: `Bearer ${token}` } });
      setMemberList(safeArray(res.data?.members ?? res.data));
    } catch { setMemberList([]); } finally { setMembersLoading(false); }
  }, []);

  const handleInviteMember = async () => {
    const token = getPreferredToken();
    if (!token || !activeId || !invitePhone.trim()) return;
    setInviting(true);
    try {
      await api.post(`/api/organizations/${activeId}/members/invite`, { phone: invitePhone.trim(), role: inviteRole || 'member' }, { headers: { Authorization: `Bearer ${token}` } });
      notifications.show({ title: 'Invite sent', message: `${invitePhone.trim()} invited as ${inviteRole}.`, color: 'green' });
      setInvitePhone(''); setShowInvite(false);
      void fetchMembers(activeId);
    } catch (err: any) {
      notifications.show({ title: 'Invite failed', message: err.response?.data?.message ?? err.message, color: 'red' });
    } finally { setInviting(false); }
  };

  const handleRemoveMember = async (userId: string) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    try {
      await api.delete(`/api/organizations/${activeId}/members/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
      notifications.show({ title: 'Member removed', message: '', color: 'gray' });
      void fetchMembers(activeId);
    } catch (err: any) {
      notifications.show({ title: 'Remove failed', message: err.response?.data?.message ?? err.message, color: 'red' });
    }
  };

  const [apActorDefaults, setApActorDefaults] = useState<WorkflowActorDefault[]>([]);
  const [orgActorMembers, setOrgActorMembers] = useState<OrgMemberActor[]>([]);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [savingActorAction, setSavingActorAction] = useState<string | null>(null);

  // Capability flow
  const [capabilities, setCapabilities] = useState<CapabilityInfo[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);

  // Setup bottom sheet
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [paymentModes, setPaymentModes] = useState<string[]>([]);
  const [branding, setBranding] = useState({ orgName: '', primaryColor: '#228be6' });
  const [activating, setActivating] = useState(false);
  const [activeWorkflowTypes, setActiveWorkflowTypes] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<OrganizationReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const loadActiveWorkflowTypes = useCallback(async (orgId?: string | null) => {
    const targetOrgId = orgId || getActiveOrgId();
    if (!targetOrgId) {
      setActiveWorkflowTypes([]);
      return;
    }

    try {
      const token = getPreferredToken() || getWalletToken();
      const workflowsRes = await api.get(`/api/organizations/${targetOrgId}/workflows`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const enabledTypes = (safeArray(workflowsRes.data?.templates))
        .filter((t: any) => t.enabled)
        .map((t: any) => String(t.workflowType || t.id || ''))
        .filter((value: string) => value.length > 0);
      setActiveWorkflowTypes(enabledTypes);
    } catch {
      setActiveWorkflowTypes([]);
    }
  }, []);

  const loadReadiness = useCallback(async (orgId?: string | null) => {
    const targetOrgId = orgId || getActiveOrgId();
    if (!targetOrgId) {
      setReadiness(null);
      return;
    }

    setReadinessLoading(true);
    try {
      const token = getPreferredToken() || getWalletToken();
      const res = await api.get(`/api/organizations/${targetOrgId}/setup/readiness`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setReadiness(res.data ?? null);
    } catch {
      setReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  useEffect(() => {
    setActiveId(getActiveOrgId());
    setActiveLabel(getActiveOrgLabel());
    loadOrgs();
    loadCapabilities();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    void loadStoreBasics(activeId);
    void loadWorkflowActorDefaults();
    void fetchMembers(activeId);
    void loadActiveWorkflowTypes(activeId);
    void loadReadiness(activeId);
  }, [activeId, fetchMembers, loadActiveWorkflowTypes, loadReadiness]);

  // ── Data loading (reused from original) ──

  const loadOrgs = async () => {
    setLoading(true);
    try {
      const token = getWalletToken();
      const res = await api.get('/api/organizations', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data: any[] = safeArray(res.data);
      setOrgs(data.map((o) => ({
        value: o.orgTenantId ?? o.id,
        label: o.name ?? o.label ?? o.id,
        sector: o.sector,
      })));
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to load organisations');
    } finally {
      setLoading(false);
    }
  };

  const loadCapabilities = async () => {
    setCapabilitiesLoading(true);
    try {
      const res = await api.get('/api/workflow-templates/capabilities');
      const normalized = safeArray(res.data).map((item) => normalizeCapability(item));
      setCapabilities(normalized);
      await loadActiveWorkflowTypes();
    } catch {
      // Non-critical — legacy sector flow will remain available
    } finally {
      setCapabilitiesLoading(false);
    }
  };

  const loadStoreBasics = async (orgId: string) => {
    setStoreLoading(true);
    try {
      const res = await api.get(`/api/discovery/organizations/${encodeURIComponent(orgId)}/storefront`);
      const data = res.data || {};
      const rails = Array.isArray(data?.paymentRails) ? data.paymentRails : [];
      setStorefront({
        orgId: data?.orgId || orgId,
        tenantId: data?.tenantId || orgId,
        displayName: data?.displayName || activeLabel || 'Organization Store',
        category: data?.category,
        verificationStatus: data?.verificationStatus,
        trustScore: Number(data?.trustScore || 0),
        isPublic: typeof data?.isPublic === 'boolean' ? data.isPublic : undefined,
        paymentRails: rails,
        services: Array.isArray(data?.services) ? data.services : [],
        catalogItems: Array.isArray(data?.catalogItems) ? data.catalogItems : [],
      });
      setStorePaymentRails(rails);
      setStoreIsPublic(typeof data?.isPublic === 'boolean' ? data.isPublic : true);
    } catch {
      setStorefront(null);
    } finally {
      setStoreLoading(false);
    }
  };

  const loadWorkflowActorDefaults = async () => {
    if (!activeId) return;
    setActorsLoading(true);
    try {
      const token = getPreferredToken();
      const res = await api.get('/api/finance/ap/workflow-actors/defaults', {
        params: { workflowType: 'ap_trust_workflow' },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setApActorDefaults(safeArray(res.data?.defaults));
      setOrgActorMembers(safeArray(res.data?.members));
    } catch {
      setApActorDefaults([]);
      setOrgActorMembers([]);
    } finally {
      setActorsLoading(false);
    }
  };

  const saveActorDefault = async (stageAction: string, selectedUserId: string | null) => {
    const token = getPreferredToken();
    if (!token) return;
    setSavingActorAction(stageAction);
    try {
      const member = orgActorMembers.find((m) => m.userId === selectedUserId);
      await api.post('/api/finance/ap/workflow-actors/defaults', {
        workflowType: 'ap_trust_workflow',
        stageAction,
        defaultUserId: selectedUserId || undefined,
        defaultRole: member?.role,
        defaultWalletTenantId: member?.walletTenantId,
        enabled: true,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      notifications.show({
        title: 'Workflow actor updated',
        message: `${stageAction.replace(/_/g, ' ')} assignment saved.`,
        color: 'green',
      });
      await loadWorkflowActorDefaults();
    } catch (err: any) {
      notifications.show({
        title: 'Save failed',
        message: err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Could not save actor default.',
        color: 'red',
      });
    } finally {
      setSavingActorAction(null);
    }
  };

  const saveStoreVisibility = async () => {
    if (!activeId) return;
    setSavingVisibility(true);
    try {
      const token = getWalletToken();
      const res = await api.patch(
        `/api/organizations/${encodeURIComponent(activeId)}/discovery-visibility`,
        { isPublic: storeIsPublic },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );

      if (res.status >= 200 && res.status < 300) {
        notifications.show({
          title: 'Store visibility saved',
          message: storeIsPublic ? 'Your mini store is public.' : 'Your mini store is private.',
          color: 'green',
        });
        await loadStoreBasics(activeId);
      }
    } catch (err: any) {
      notifications.show({
        title: 'Save failed',
        message: err?.response?.data?.message || err?.message || 'Could not update store visibility.',
        color: 'red',
      });
    } finally {
      setSavingVisibility(false);
    }
  };

  const saveStoreRails = async () => {
    if (!activeId) return;
    setSavingRails(true);
    try {
      const token = getWalletToken();
      const res = await api.patch(
        `/api/organizations/${encodeURIComponent(activeId)}/payment-rails`,
        { paymentRails: storePaymentRails },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );

      if (res.status >= 200 && res.status < 300) {
        notifications.show({
          title: 'Payment rails saved',
          message: 'Store payment rails updated.',
          color: 'green',
        });
        await loadStoreBasics(activeId);
      }
    } catch (err: any) {
      notifications.show({
        title: 'Save failed',
        message: err?.response?.data?.message || err?.message || 'Could not update payment rails.',
        color: 'red',
      });
    } finally {
      setSavingRails(false);
    }
  };

  // ── Org switching (reused from original) ──

  const switchOrg = async (orgId: string) => {
    setSwitching(true);
    setError(null);
    try {
      const walletToken = getWalletToken();
      const res = await api.post(
        `/api/organizations/${orgId}/switch`, {},
        { headers: walletToken ? { Authorization: `Bearer ${walletToken}` } : undefined }
      );
      const { token, sector, orgName, workflowTypes, orgRole } = res.data;
      const org = orgs.find((e) => e.value === orgId);
      const orgLabel = orgName ?? org?.label ?? orgId;

      applyOrgContext({ orgId, orgName: orgLabel, orgToken: token, sector, workflowTypes });
      setActiveId(orgId);
      setActiveLabel(orgLabel);
      void loadActiveWorkflowTypes(orgId);
      void loadReadiness(orgId);
      notifications.show({ title: 'Organisation switched', message: orgLabel, color: 'green' });
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Switch failed');
    } finally {
      setSwitching(false);
    }
  };

  // ── Create org (simplified — no sector required upfront) ──

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = getWalletToken();
      const res = await api.post(
        '/api/organizations',
        { name: newOrgName.trim(), sector: 'custom' },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      const { orgTenantId } = res.data;
      const switchRes = await api.post(
        `/api/organizations/${orgTenantId}/switch`, {},
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      const { token: orgToken, sector, orgRole, workflowTypes } = switchRes.data;

      applyOrgContext({
        orgId: orgTenantId,
        orgName: newOrgName.trim(),
        orgToken,
        orgRole: orgRole ?? 'owner',
        sector,
        workflowTypes,
      });

      try {
        const existing = JSON.parse(localStorage.getItem('credoOrganizations') ?? '[]');
        localStorage.setItem('credoOrganizations', JSON.stringify([
          ...existing, { orgTenantId, name: newOrgName.trim(), role: orgRole ?? 'owner' }
        ]));
      } catch { /* storage quota */ }

      notifications.show({ title: 'Organisation created', message: newOrgName.trim(), color: 'green' });
      setActiveId(orgTenantId);
      setActiveLabel(newOrgName.trim());
      void loadActiveWorkflowTypes(orgTenantId);
      void loadReadiness(orgTenantId);
      setBranding({ ...branding, orgName: newOrgName.trim() });
      setShowCreate(false);
      setNewOrgName('');
      await loadOrgs();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create organisation');
    } finally {
      setCreating(false);
    }
  };

  // ── Capability selection toggle ──

  const toggleCapability = (id: string) => {
    setSelectedCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // ── Open setup flow (fetch templates for selected capabilities) ──

  const openSetup = async () => {
    if (selectedCapabilities.length === 0) return;
    setSetupStep(0);
    setSetupOpen(true);

    const allTemplateIds = selectedCapabilities.flatMap((capId) => {
      const cap = capabilities.find((c) => c.id === capId);
      return cap?.templates ?? [];
    });
    const uniqueIds = Array.from(new Set(allTemplateIds));

    if (uniqueIds.length === 0) {
      notifications.show({
        title: 'Workflow mapping missing',
        message: 'Selected capability has no workflow templates configured yet.',
        color: 'red',
      });
      setSetupOpen(false);
      return;
    }

    try {
      const res = await api.post('/api/workflow-templates/bulk', { ids: uniqueIds });
      const fetched = safeArray(res.data).map((item) => normalizeTemplate(item));
      setTemplates(fetched);
      const mergedPayments = Array.from(new Set(fetched.flatMap((t) => t.paymentModes || [])));
      setPaymentModes(mergedPayments);
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to load template details', color: 'red' });
      setSetupOpen(false);
    }
  };

  // ── Configure workflows ──

  const handleConfigure = async () => {
    if (!activeId) {
      notifications.show({
        title: 'Configuration Failed',
        message: 'No active organization selected. Switch to an organization first.',
        color: 'red',
      });
      return;
    }

    if (templates.length === 0) {
      notifications.show({
        title: 'Configuration Failed',
        message: 'No workflow templates selected for activation.',
        color: 'red',
      });
      return;
    }

    setActivating(true);
    try {
      let token = getPreferredToken();
      if (!token) {
        const walletToken = getWalletToken();
        if (walletToken) {
          const switchRes = await api.post(
            `/api/organizations/${activeId}/switch`,
            {},
            { headers: { Authorization: `Bearer ${walletToken}` } }
          );
          const { token: orgToken, sector, orgName, workflowTypes, orgRole } = switchRes.data || {};
          if (orgToken) {
            applyOrgContext({
              orgId: activeId,
              orgName: orgName || activeLabel || branding.orgName || 'Organization',
              orgToken,
              orgRole,
              sector,
              workflowTypes,
            });
            token = orgToken;
          }
        }
      }

      if (!token) {
        throw new Error('Organization session expired. Switch organization and try again.');
      }

      const preferredTemplate = templates.find((template) => template.sector && template.sector !== 'custom') || templates[0];
      const primarySector = preferredTemplate?.sector || 'custom';
      const allWorkflowTypes = templates.map((t) => t.workflowType);

      // Merge with currently active workflow types so activating new capabilities
      // does not deactivate the existing ones (e.g. adding school fees won't kill requisitions).
      const merged: string[] = Array.from(new Set([...activeWorkflowTypes, ...allWorkflowTypes]));

      // For custom-only selections (for example AR/AP templates), do not send `sector: custom`.
      // Sending custom forces backend default-template resolution, which currently maps to
      // internal requisitions and can activate the wrong module.
      const activationPayload = primarySector === 'custom'
        ? {
            name: branding.orgName || activeLabel || templates[0].name,
            additionalWorkflowTypes: merged,
            paymentModes,
            reconciliationPolicy: { mode: 'automatic' },
            evidencePolicy: templates[0].evidencePolicy,
            brandingPolicy: { orgName: branding.orgName || activeLabel, primaryColor: branding.primaryColor },
          }
        : {
            sector: primarySector,
            name: branding.orgName || activeLabel || templates[0].name,
            additionalWorkflowTypes: merged.filter((t) => t !== primarySector),
            paymentModes,
            reconciliationPolicy: { mode: 'automatic' },
            evidencePolicy: templates[0].evidencePolicy,
            brandingPolicy: { orgName: branding.orgName || activeLabel, primaryColor: branding.primaryColor },
          };

      const res = await api.post(
        `/api/organizations/${activeId}/workflows/configure`,
        activationPayload,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );

      const result = res.data;
      localStorage.setItem('credoTenantSector', primarySector);
      const updatedWorkflowTypes = (result.templates ?? [])
        .filter((t: any) => t.enabled)
        .map((t: any) => t.workflowType);
      localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(updatedWorkflowTypes));
      setActiveWorkflowTypes(updatedWorkflowTypes);
      await loadActiveWorkflowTypes(activeId);
      await loadReadiness(activeId);

      const firstEnabled = result.templates?.find((t: any) => t.enabled);
      if (firstEnabled?.id) localStorage.setItem('credoActiveTemplateId', firstEnabled.id);

      notifications.show({
        title: 'Capabilities Configured',
        message: `${templates.length} workflow(s) configured.`,
        color: 'green',
      });

      setSetupOpen(false);
      setSelectedCapabilities([]);
    } catch (err: any) {
      notifications.show({
        title: 'Configuration Failed',
        message: err.response?.data?.message ?? err.message ?? 'Failed to configure workflows',
        color: 'red',
      });
    } finally {
      setActivating(false);
    }
  };

  // ── Derived data ──

  const allVCs = useMemo(
    () => Array.from(new Set(templates.flatMap((t) => t.credentialPolicy?.outputVCs ?? []))),
    [templates]
  );

  const setupStepCount = 4; // review → payments → credentials → configure

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb={80}>
        {/* ── Header ── */}
        <Box>
          <Title order={3}>Organisation</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Manage your organisations and configure capabilities.
          </Text>
        </Box>

        <Divider />
        {error && <ErrorAlert message={error} />}

        {/* ── Create Org ── */}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setShowCreate((c) => !c)} fullWidth>
          {showCreate ? 'Close' : 'Create Organisation'}
        </Button>

        <Collapse in={showCreate}>
          <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Title order={5}>New Organisation</Title>
              <Text size="xs" c="dimmed">Name your organisation, then select capabilities below to configure it.</Text>
              <TextInput
                label="Name"
                placeholder="Acme Traders"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
              />
              <Group justify="flex-end">
                <Button variant="subtle" size="sm" onClick={() => { setShowCreate(false); setNewOrgName(''); }}>Cancel</Button>
                <Button size="sm" loading={creating} disabled={!newOrgName.trim()} onClick={createOrg}>
                  Create & Continue
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Collapse>

        {/* ── Org List (reused from original) ── */}
        {loading ? (
          <Center py="xl"><Loader color="credentis" /></Center>
        ) : (
          <Stack gap="sm">
            {orgs.map((org) => (
              <Paper
                key={org.value}
                p="md"
                radius="md"
                style={{
                  border: `2px solid ${org.value === activeId ? '#2188ca' : '#e2e8f0'}`,
                  background: org.value === activeId ? '#e8f4fa' : '#ffffff',
                  cursor: 'pointer',
                }}
                onClick={() => org.value !== activeId && switchOrg(org.value)}
              >
                <Group justify="space-between" align="center">
                  <Group gap="sm">
                    <Box style={{ width: 36, height: 36, borderRadius: 8, background: '#2188ca22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconBuilding size={18} color="#2188ca" />
                    </Box>
                    <Box>
                      <Text fw={600} size="sm">{org.label}</Text>
                      {org.sector && <Text size="xs" c="dimmed" tt="capitalize">{org.sector}</Text>}
                    </Box>
                  </Group>
                  {org.value === activeId ? (
                    <Badge color="credentis" leftSection={<IconCheck size={10} />}>Active</Badge>
                  ) : (
                    <Button size="xs" variant="light" loading={switching} onClick={(e) => { e.stopPropagation(); switchOrg(org.value); }}>
                      Switch
                    </Button>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        )}

        {activeId && (
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Stack gap="xs">
                <Group justify="space-between" align="start">
                  <Box>
                    <Text fw={700}>Setup Readiness</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Capability-driven onboarding status for this organisation.
                    </Text>
                  </Box>
                  {readiness ? (
                    <Badge color={readiness.readinessState === 'ready' ? 'green' : readiness.readinessState === 'blocked' ? 'red' : 'yellow'}>
                      {readiness.readinessState.replace(/_/g, ' ')}
                    </Badge>
                  ) : null}
                </Group>

                {readinessLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : readiness ? (
                  <>
                    <Group justify="space-between" align="center">
                      <Text size="sm" fw={600}>{readiness.orgName || activeLabel || 'Organisation'}</Text>
                      <Badge variant="light" color="blue">{readiness.readinessPercent}% ready</Badge>
                    </Group>

                    {readiness.nextActions.length > 0 ? (
                      <Paper p="xs" radius="sm" withBorder>
                        <Text size="xs" fw={700} c="dimmed" mb={4}>NEXT ACTIONS</Text>
                        <Stack gap={4}>
                          {readiness.nextActions.slice(0, 3).map((action) => (
                            <Text key={action} size="xs">• {action}</Text>
                          ))}
                        </Stack>
                      </Paper>
                    ) : (
                      <Alert variant="light" color="green" icon={<IconCheck size={14} />}>
                        <Text size="xs">No critical setup blockers detected.</Text>
                      </Alert>
                    )}
                  </>
                ) : (
                  <Text size="xs" c="dimmed">Readiness will appear after selecting or creating an organisation.</Text>
                )}
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="start">
                  <Box>
                    <Text fw={700}>Workflow Actors (AP)</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Choose who receives inbound AP workflow actions by stage. Owner/admin fallback remains active when not configured.
                    </Text>
                  </Box>
                  <Badge variant="light" color="indigo">Configurable</Badge>
                </Group>

                {actorsLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : (
                  <Stack gap="xs">
                    {AP_ACTOR_ACTIONS.map((action) => {
                      const current = apActorDefaults.find((row) => row.stageAction === action.value);
                      const value = current?.defaultUserId || null;
                      return (
                        <Paper key={action.value} p="xs" radius="sm" withBorder>
                          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                            <Box style={{ flex: 1, minWidth: 220 }}>
                              <Text size="xs" fw={600}>{action.label}</Text>
                              <Text size="10px" c="dimmed">Stage key: {action.value}</Text>
                            </Box>
                            <Group gap="xs" wrap="nowrap" style={{ minWidth: 280, flex: 1 }}>
                              <Select
                                style={{ flex: 1 }}
                                size="xs"
                                placeholder="Owner/Admin fallback"
                                data={orgActorMembers.map((member) => ({
                                  value: member.userId,
                                  label: `${member.userId.slice(0, 10)}… · ${member.role}${member.walletTenantId ? ' · wallet' : ''}`,
                                }))}
                                value={value}
                                clearable
                                searchable
                                onChange={(next) => saveActorDefault(action.value, next)}
                                disabled={savingActorAction === action.value}
                              />
                              {savingActorAction === action.value && <Loader size="xs" />}
                            </Group>
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </Paper>

            {/* ── Member Management ── */}
            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="start">
                  <Box>
                    <Group gap="xs"><IconUsers size={18} color="var(--mantine-color-indigo-6)" /><Text fw={700}>Team Members</Text></Group>
                    <Text size="xs" c="dimmed" mt={4}>Invite, manage roles, and remove members from this organisation.</Text>
                  </Box>
                  <Button size="xs" leftSection={<IconUserPlus size={14} />} onClick={() => setShowInvite((s) => !s)}>Invite</Button>
                </Group>

                <Collapse in={showInvite}>
                  <Paper p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <TextInput label="Phone number" placeholder="+263..." value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} size="xs" />
                      <Select label="Role" size="xs" value={inviteRole} onChange={setInviteRole} data={[
                        { value: 'approver', label: 'Approver' },
                        { value: 'manager', label: 'Manager' },
                        { value: 'finance', label: 'Finance Officer' },
                        { value: 'field_worker', label: 'Field Worker' },
                        { value: 'admin', label: 'Admin' },
                      ]} />
                      <Group justify="flex-end">
                        <Button size="xs" variant="subtle" onClick={() => setShowInvite(false)}>Cancel</Button>
                        <Button size="xs" loading={inviting} disabled={!invitePhone.trim()} onClick={handleInviteMember}>Send Invite</Button>
                      </Group>
                    </Stack>
                  </Paper>
                </Collapse>

                {membersLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : memberList.length === 0 ? (
                  <Text size="xs" c="dimmed">No members yet. Invite your team above.</Text>
                ) : (
                  <Stack gap="xs">
                    {memberList.map((m) => (
                      <Paper key={m.userId} p="xs" radius="sm" withBorder>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs" fw={600} truncate style={{ fontFamily: 'monospace' }}>{m.userId.substring(0, 16)}&hellip;</Text>
                            <Group gap={4} mt={2}>
                              <Badge size="xs" variant="light" color="indigo">{m.role}</Badge>
                              {m.walletTenantId && <Badge size="xs" variant="dot" color="teal">wallet</Badge>}
                              <Badge size="xs" variant="light" color={m.status === 'active' ? 'green' : 'gray'}>{m.status}</Badge>
                            </Group>
                          </Box>
                          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => handleRemoveMember(m.userId)}>
                            Remove
                          </Button>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="md">
                <Group justify="space-between" align="start">
                  <Box>
                    <Group gap="xs">
                      <IconBuildingStore size={18} color="var(--mantine-color-teal-6)" />
                      <Text fw={700}>Store Basics</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      Keep simple store settings in the app. Portal is for the deeper publish and workflow work.
                    </Text>
                  </Box>
                  <Badge variant="light" color={storefront?.isPublic === false ? 'gray' : 'green'}>
                    {storefront?.isPublic === false ? 'Private' : 'Public'}
                  </Badge>
                </Group>

                {storeLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : (
                  <>
                    <Group gap="xs" wrap="wrap">
                      <Badge variant="light" color="teal">{storefront?.services?.length || 0} services</Badge>
                      <Badge variant="light" color="blue">{storefront?.catalogItems?.length || 0} products</Badge>
                      {typeof storefront?.trustScore === 'number' && (
                        <Badge variant="light" color="violet">Trust {storefront.trustScore.toFixed(0)}</Badge>
                      )}
                    </Group>

                    <Stack gap={6}>
                      <Text size="xs" fw={600}>Discovery visibility</Text>
                      <Group gap="sm">
                        <Button
                          size="xs"
                          variant={storeIsPublic ? 'filled' : 'light'}
                          onClick={() => setStoreIsPublic(true)}
                        >
                          Public
                        </Button>
                        <Button
                          size="xs"
                          variant={!storeIsPublic ? 'filled' : 'light'}
                          onClick={() => setStoreIsPublic(false)}
                        >
                          Private
                        </Button>
                        <Button size="xs" loading={savingVisibility} onClick={saveStoreVisibility}>
                          Save Visibility
                        </Button>
                      </Group>
                    </Stack>

                    <Stack gap={6}>
                      <Text size="xs" fw={600}>Payment rails</Text>
                      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                        {STORE_PAYMENT_RAIL_OPTIONS.map((rail) => {
                          const selected = storePaymentRails.includes(rail.value);
                          return (
                            <Button
                              key={rail.value}
                              size="xs"
                              variant={selected ? 'filled' : 'light'}
                              onClick={() => setStorePaymentRails((prev) => prev.includes(rail.value) ? prev.filter((value) => value !== rail.value) : [...prev, rail.value])}
                            >
                              {rail.label}
                            </Button>
                          );
                        })}
                      </SimpleGrid>
                      <Group>
                        <Button size="xs" loading={savingRails} onClick={saveStoreRails}>
                          Save Rails
                        </Button>
                      </Group>
                    </Stack>

                    <Group>
                      <Button size="xs" variant="light" onClick={() => router.push(`/organizations/${activeId}?source=my-orgs`)}>
                        Review Mini Store
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => router.push('/organizations')}>
                        Open Orgs
                      </Button>
                    </Group>
                  </>
                )}
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.06), rgba(13,148,136,0.04))' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="start">
                  <Box>
                    <Group gap="xs">
                      <IconBuildingStore size={18} color="var(--mantine-color-blue-6)" />
                      <Text fw={700}>Store Preview</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      A compact mirror of the published mini store. The portal handles deeper configuration.
                    </Text>
                  </Box>
                  <Badge variant="light" color={storefront?.isPublic === false ? 'gray' : 'blue'}>
                    {storefront?.displayName || activeLabel || 'Organization Store'}
                  </Badge>
                </Group>

                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                  <Paper p="xs" radius="md" withBorder>
                    <Text size="xs" c="dimmed">Visibility</Text>
                    <Text size="sm" fw={700}>{storefront?.isPublic === false ? 'Private' : 'Public'}</Text>
                  </Paper>
                  <Paper p="xs" radius="md" withBorder>
                    <Text size="xs" c="dimmed">Services</Text>
                    <Text size="sm" fw={700}>{storefront?.services?.length || 0}</Text>
                  </Paper>
                  <Paper p="xs" radius="md" withBorder>
                    <Text size="xs" c="dimmed">Products</Text>
                    <Text size="sm" fw={700}>{storefront?.catalogItems?.length || 0}</Text>
                  </Paper>
                  <Paper p="xs" radius="md" withBorder>
                    <Text size="xs" c="dimmed">Rails</Text>
                    <Text size="sm" fw={700}>{storePaymentRails.length}</Text>
                  </Paper>
                </SimpleGrid>

                <Group gap="xs" wrap="wrap">
                  {storefront?.paymentRails?.slice(0, 4).map((rail) => (
                    <Badge key={rail} variant="light" color="cyan">
                      {rail}
                    </Badge>
                  ))}
                  {(storefront?.paymentRails?.length || 0) === 0 && (
                    <Text size="xs" c="dimmed">No rails declared yet.</Text>
                  )}
                </Group>

                <Group gap="xs">
                  <Button size="xs" onClick={() => router.push(`/organizations/${activeId}?source=my-orgs`)}>
                    Open In-App Preview
                  </Button>
                  <Button size="xs" variant="light" onClick={() => router.push(`/shop?orgId=${encodeURIComponent(activeId)}&merchantId=${encodeURIComponent(activeId)}`)}>
                    Open Shop
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        )}

        {/* ── Workflow Selection Grid ── */}
        {activeId && (
          <>
            <Divider label="What do you want to achieve?" labelPosition="center" />

            {capabilitiesLoading ? (
              <Center py="md"><Loader size="sm" /></Center>
            ) : capabilities.length === 0 ? (
              <Alert variant="light" color="gray">
                Workflow discovery unavailable. Use the portal for advanced setup.
              </Alert>
            ) : (
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  Select the capabilities you need. Tap to toggle, then configure below.
                </Text>

                <SimpleGrid cols={2} spacing="sm">
                  {capabilities.map((cap) => {
                    const isActive = cap.templates.some(t => activeWorkflowTypes.includes(t));
                    const selected = selectedCapabilities.includes(cap.id) || isActive;
                    const color = isActive ? 'teal' : (CATEGORY_COLORS[cap.category] || 'gray');
                    return (
                      <Card
                        key={cap.id}
                        p="sm"
                        radius="md"
                        withBorder
                        style={{
                          cursor: isActive ? 'default' : 'pointer',
                          borderColor: selected ? `var(--mantine-color-${color}-5)` : undefined,
                          background: selected ? `var(--mantine-color-${color}-0)` : undefined,
                          transition: 'all 0.15s ease',
                          opacity: isActive ? 0.9 : 1,
                        }}
                        onClick={() => !isActive && toggleCapability(cap.id)}
                      >
                        <Stack gap={6} align="center">
                          <ThemeIcon
                            size={44}
                            radius="md"
                            variant={selected ? 'filled' : 'light'}
                            color={color}
                          >
                            {resolveCapabilityIcon(cap.icon)}
                          </ThemeIcon>
                          <Text size="xs" fw={600} ta="center" lineClamp={1}>{cap.label}</Text>
                          <Text size="xs" c="dimmed" ta="center" lineClamp={2}>{cap.description}</Text>
                          {isActive ? (
                            <Badge size="xs" variant="filled" color="teal">Active</Badge>
                          ) : selected && (
                            <Badge size="xs" variant="light" color={color}>
                              {cap.templates.length} workflow{cap.templates.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </Stack>
                      </Card>
                    );
                  })}
                </SimpleGrid>

                {selectedCapabilities.length > 0 && (
                  <Button
                    fullWidth
                    size="md"
                    leftSection={<IconRocket size={18} />}
                    onClick={openSetup}
                    mt="xs"
                  >
                    Configure {selectedCapabilities.length} Workflow{selectedCapabilities.length > 1 ? 's' : ''}
                  </Button>
                )}
              </Stack>
            )}
          </>
        )}
      </Stack>

      {/* ── Setup Bottom Sheet (reuses existing BottomSheet component) ── */}
      <BottomSheet
        opened={setupOpen}
        onClose={() => setSetupOpen(false)}
        title={`Configure · Step ${setupStep + 1} of ${setupStepCount}`}
      >
        <ScrollArea.Autosize mah="65vh" offsetScrollbars>
          <Stack gap="md" pb="lg" px="xs">

            {/* Step 0: Review */}
            {setupStep === 0 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>Selected Workflows</Text>
                {templates.length === 0 ? (
                  <Center py="md"><Loader size="sm" /></Center>
                ) : (
                  <Stack gap="xs">
                    {templates.map((t) => (
                      <Paper key={t.id} p="xs" radius="sm" withBorder>
                        <Group gap="xs" wrap="nowrap">
                          <ThemeIcon size={28} radius="md" variant="light" color="blue">
                            <IconSettingsAutomation size={14} />
                          </ThemeIcon>
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs" fw={600} lineClamp={1}>{t.name}</Text>
                            <Text size="xs" c="dimmed">{t.workflowType} · {t.steps?.length ?? 0} steps</Text>
                          </Box>
                          <Badge size="xs" variant="light">{t.sector}</Badge>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            )}

            {/* Step 1: Payment Methods */}
            {setupStep === 1 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>Payment Methods</Text>
                <Text size="xs" c="dimmed">Select which payment methods to accept across all workflows.</Text>
                <Stack gap="xs">
                  {PAYMENT_OPTIONS.map((opt) => {
                    const sel = paymentModes.includes(opt.value);
                    return (
                      <Paper
                        key={opt.value}
                        p="xs"
                        radius="sm"
                        withBorder
                        style={{
                          cursor: 'pointer',
                          borderColor: sel ? `var(--mantine-color-${opt.color}-5)` : undefined,
                          background: sel ? `var(--mantine-color-${opt.color}-0)` : undefined,
                        }}
                        onClick={() => setPaymentModes((prev) =>
                          prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                        )}
                      >
                        <Group gap="sm" wrap="nowrap">
                          <ThemeIcon size={32} radius="md" variant={sel ? 'filled' : 'light'} color={opt.color}>
                            {opt.icon}
                          </ThemeIcon>
                          <Text size="sm" fw={500} style={{ flex: 1 }}>{opt.label}</Text>
                          {sel && <IconCheck size={16} color="green" />}
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              </Stack>
            )}

            {/* Step 2: Credentials */}
            {setupStep === 2 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>Credentials You'll Own</Text>
                <Text size="xs" c="dimmed">Your organisation will issue these verifiable credentials.</Text>
                {allVCs.map((vc) => (
                  <Paper key={vc} p="xs" radius="sm" withBorder>
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon size={32} radius="md" variant="gradient" gradient={{ from: 'indigo', to: 'blue' }}>
                        <IconCertificate size={16} />
                      </ThemeIcon>
                      <Box style={{ flex: 1 }}>
                        <Text size="xs" fw={600}>{vc}</Text>
                        <Text size="xs" c="dimmed">Issuer-signed, portable credential</Text>
                      </Box>
                      <Badge size="xs" variant="light" color="blue">owner</Badge>
                    </Group>
                  </Paper>
                ))}
                <Paper p="xs" radius="sm" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
                  <Group gap="xs">
                    <IconShieldCheck size={14} color="var(--mantine-color-indigo-5)" />
                    <Text size="xs" c="dimmed">
                      Recipients get portable, verifiable proof — reducing reliance on manual audits.
                    </Text>
                  </Group>
                </Paper>
              </Stack>
            )}

            {/* Step 3: Configure */}
            {setupStep === 3 && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>Review & Configure</Text>

                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" fw={700} c="dimmed" mb={4}>WORKFLOWS</Text>
                  <Stack gap={2}>
                    {templates.map((t) => <Text key={t.id} size="xs" fw={500}>• {t.name}</Text>)}
                  </Stack>
                </Paper>

                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" fw={700} c="dimmed" mb={4}>PAYMENTS</Text>
                  <Group gap={4}>
                    {paymentModes.map((m) => <Badge key={m} size="xs" variant="outline">{m.replace(/_/g, ' ')}</Badge>)}
                    {paymentModes.length === 0 && <Text size="xs" c="dimmed">None selected</Text>}
                  </Group>
                </Paper>

                <Paper p="xs" radius="sm" withBorder>
                  <Text size="xs" fw={700} c="dimmed" mb={4}>CREDENTIALS</Text>
                  <Group gap={4}>
                    {allVCs.map((vc) => <Badge key={vc} size="xs" variant="outline" color="blue">{vc}</Badge>)}
                  </Group>
                </Paper>

                <TextInput
                  label="Organisation Name"
                  size="xs"
                  placeholder={activeLabel || 'Your Organisation'}
                  value={branding.orgName}
                  onChange={(e) => setBranding({ ...branding, orgName: e.target.value })}
                />
                <ColorInput
                  label="Brand Colour"
                  size="xs"
                  value={branding.primaryColor}
                  onChange={(c) => setBranding({ ...branding, primaryColor: c })}
                  swatches={['#228be6', '#12b886', '#fab005', '#fa5252', '#7950f2', '#0A3D5C']}
                />

                <Alert variant="light" color="blue" icon={<IconRocket size={14} />}>
                  <Text size="xs">
                    Activating defines your organisation as a trusted node. Your app adapts to these capabilities.
                  </Text>
                </Alert>
              </Stack>
            )}
          </Stack>
        </ScrollArea.Autosize>

        {/* ── Navigation (thumb-zone) ── */}
        <Divider />
        <Group justify="space-between" p="sm">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => setupStep === 0 ? setSetupOpen(false) : setSetupStep((s) => s - 1)}
          >
            {setupStep === 0 ? 'Close' : 'Back'}
          </Button>

          {setupStep < setupStepCount - 1 ? (
            <Button
              size="sm"
              rightSection={<IconArrowRight size={14} />}
              onClick={() => setSetupStep((s) => s + 1)}
              disabled={setupStep === 1 && paymentModes.length === 0}
            >
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              color="green"
              leftSection={<IconCheck size={14} />}
              loading={activating}
              onClick={handleConfigure}
            >
              Configure
            </Button>
          )}
        </Group>
      </BottomSheet>
    </AppShellMobile>
  );
}
