import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Stack, Title, Text, Box, Divider, Button, Group, Checkbox, TextInput, Alert, Loader, Center,
  Paper, Badge, Collapse, Stepper, SimpleGrid, ThemeIcon, Card, ColorInput, ScrollArea, Select,
  SegmentedControl, Modal, Radio, Chip, Progress,
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
import HandoffSettingsCard from '@/components/shared/HandoffSettingsCard';
import api, { safeArray } from '@/lib/api';
import { getActiveOrgLabel, getActiveOrgId, getWalletToken, getPreferredToken, applyOrgContext, getOrgRoleClaim } from '@/lib/auth';
import { ORG_KIND_OPTIONS, PAYMENT_CHOICES, SETUP_PROFILE_PATH, kindsFromRequestTypes, persistOrgProfile, profileFromServer, profileToServer, readOrgProfile, setupChecklist, type OrgKind, type OrgProfile, type PaymentChoice, type SetupStepId } from '@/lib/orgProfile';

// ── Org list types ──

interface OrgOption {
  value: string;
  label: string;
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
  displayName?: string;
  phone?: string;
}

/** Show a person by name; fall back to phone, then "Owner"/"Team member". Never a raw ID. */
function personName(member?: { displayName?: string; phone?: string; role?: string } | null, fallbackId?: string): string {
  const name = String(member?.displayName || '').trim();
  if (name && !/^(organization owner|team member)$/i.test(name)) return name;
  if (member?.phone) return member.phone;
  if (member?.role === 'owner') return 'Owner';
  if (member?.role === 'field_worker') return 'Field worker';
  if (member?.role === 'supervisor') return 'Supervisor';
  if (member?.role === 'finance_manager') return 'Finance officer';
  if (member) return 'Team member';
  const id = String(fallbackId || '');
  return id.length > 14 ? `${id.slice(0, 8)}…` : id || 'Team member';
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Team member',
  field_worker: 'Field worker',
  supervisor: 'Supervisor',
  dispatcher: 'Dispatcher',
  approver: 'Approver',
  manager: 'Manager',
  finance_manager: 'Finance officer',
  director: 'Director',
};

const MEMBER_ROLE_CHOICES = [
  { value: 'member', label: 'Team member' },
  { value: 'field_worker', label: 'Field worker' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'approver', label: 'Approver' },
  { value: 'manager', label: 'Manager' },
  { value: 'finance_manager', label: 'Finance officer' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Admin' },
];

interface WorkflowActorDefault {
  id: string;
  workflowType: string;
  stageAction: string;
  defaultRole?: string;
  defaultUserId?: string;
  defaultWalletTenantId?: string;
  enabled: boolean;
}

interface ActorFallbackEntry {
  type: 'user' | 'role' | 'wallet';
  value: string;
  label?: string;
}

interface StageActorCredential {
  state: 'accepted' | 'offered' | 'not_offered' | 'not_applicable';
  offeredAt?: string;
  acceptedAt?: string;
  stageActions?: string[];
  stale?: boolean;
}

/** Mirrors OrganizationService.WorkflowActorsView (GET /api/organizations/{id}/workflows/actors). */
interface WorkflowActorStageView {
  stageAction: string;
  title?: string;
  requirement: string;
  actor: {
    userId?: string;
    walletTenantId?: string;
    role: string;
    mode: string;
    via?: ActorFallbackEntry;
  };
  actorDescription: string;
  needsAssignment: boolean;
  /** Approving, releasing, recording or receipting money. Shares the purchase-request people. */
  moneyStep?: boolean;
  /** Not a money step and nobody chosen: picked the first time the request is used. */
  askedOnFirstUse?: boolean;
  default?: WorkflowActorDefault;
  builtInRoles: string[];
  stageChain: ActorFallbackEntry[];
  credential: StageActorCredential;
}

interface WorkflowActorsView {
  orgTenantId: string;
  workflows: Array<{ templateId?: string; workflowType: string; name?: string; stages: WorkflowActorStageView[] }>;
  members: OrgMemberActor[];
  roles: string[];
  policy: {
    useBuiltInRoleFallbacks: boolean;
    ownerFallbackEnabled: boolean;
    defaultChain: ActorFallbackEntry[];
    stageChains: Record<string, ActorFallbackEntry[]>;
    signGroups?: Record<string, 'one' | 'both'>;
  };
  presets?: Array<{ id: string; title: string; detail: string; signMode: 'one' | 'both' }>;
  canEdit: boolean;
}

const ACTOR_USER_PREFIX = 'user:';
const ACTOR_ROLE_PREFIX = 'role:';

function actorSelectValue(def?: WorkflowActorDefault): string | null {
  if (!def || !def.enabled) return null;
  if (def.defaultUserId) return `${ACTOR_USER_PREFIX}${def.defaultUserId}`;
  if (def.defaultRole) return `${ACTOR_ROLE_PREFIX}${def.defaultRole}`;
  return null;
}

function humanizeKey(value?: string): string {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortStepTitle(stageAction: string, title?: string): string {
  const action = stageAction.toLowerCase();
  if (action.includes('assign_field')) return 'Who does the job';
  if (action.includes('inspect')) return 'Site check';
  if (action.includes('review')) return 'Work review';
  if (action.includes('remittance')) return 'Money received';
  if (action.includes('acknowledge')) return 'Customer sign-off';
  if (action.includes('payout') || action.includes('release_funds')) return 'Payment release';
  if (action.includes('record_payment')) return 'Recording the payment';
  if (action.includes('receipt')) return 'Receipt';
  if (action.includes('payment_proof')) return 'Proof of payment';
  if (action.includes('finance_approve')) return 'Finance approval';
  if (action.includes('approve')) return 'Approval';
  return (title || '').replace(/\s*\([^)]*\)/g, '').trim() || 'Step';
}

function isPurchaseRequests(workflow: { workflowType: string }): boolean {
  return workflow.workflowType.toLowerCase().includes('requisition');
}

function plainRequestName(workflow: { name?: string; workflowType: string }): string {
  const type = workflow.workflowType.toLowerCase();
  const name = workflow.name || '';
  if (type.includes('field') || /fept/i.test(name)) return 'Jobs';
  if (type.includes('requisition')) return 'Purchase requests';
  if (type.includes('payable') || type.includes('ap_')) return 'Supplier bills';
  if (/payment[_-]collection|collect_payments|accounts_receivable|ar_collections/.test(type)) return 'Customer payments';
  if (type.includes('education') || type.includes('fee')) return 'School fees';
  if (type.includes('cash')) return 'Counter sales';
  return name || 'Requests';
}

function credentialLabel(credential?: StageActorCredential): { color: string; label: string } | null {
  if (!credential || credential.state === 'not_applicable') return null;
  if (credential.stale) return { color: 'yellow', label: 'Role card out of date' };
  if (credential.state === 'accepted') return { color: 'teal', label: 'Role card in wallet' };
  if (credential.state === 'offered') return { color: 'blue', label: 'Role card sent' };
  return { color: 'orange', label: 'Role card not sent yet' };
}

type ReadinessRequirement = 'mandatory' | 'conditional' | 'recommended';
type ReadinessStatus = 'ready' | 'needs_attention' | 'pending_external' | 'optional';
type ReadinessDomain = 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations';

interface ReadinessItem {
  key: string;
  title: string;
  domain: ReadinessDomain;
  requirement: ReadinessRequirement;
  status: ReadinessStatus;
  reason?: string;
  requiredFor?: string[];
  stageAction?: string;
  actionPath?: string;
  /** Not a money step and nobody chosen: asked the first time the request is used. */
  askedOnFirstUse?: boolean;
}

interface WorkflowReadinessSummary {
  templateId?: string;
  workflowType: string;
  name?: string;
  ready: boolean;
  blocking: string[];
}

interface OrganizationReadiness {
  orgTenantId: string;
  orgName: string;
  readinessPercent: number;
  readinessState: 'ready' | 'in_progress' | 'blocked';
  items: ReadinessItem[];
  nextActions: string[];
  /** Per-workflow readiness derived from declared prerequisites. */
  workflows?: WorkflowReadinessSummary[];
}

type ReadinessFixTarget = 'members' | 'actors' | 'payments' | 'partners' | 'profile' | 'store' | 'departments';

/** One settings area per screen. `null` is the organisation home. */
type OrgSection = 'team' | 'actors' | 'payments' | 'departments' | 'handoffs' | 'store';

const SECTION_FOR_FIX: Record<ReadinessFixTarget, OrgSection> = {
  members: 'team',
  departments: 'departments',
  actors: 'actors',
  payments: 'payments',
  partners: 'payments',
  // SGK demo branch: there is no public store screen here, so these land on Team.
  profile: 'team',
  store: 'team',
};

/** SGK demo branch: the Store section stays in the code but is not offered. */
const SHOW_STORE_SECTION = false;

const SECTION_LABELS: Array<{ id: OrgSection; label: string }> = [
  { id: 'team', label: 'Team' },
  { id: 'actors', label: 'Who does what' },
  { id: 'payments', label: 'Payments' },
  { id: 'departments', label: 'Departments' },
  { id: 'handoffs', label: 'What happens next' },
  ...(SHOW_STORE_SECTION ? [{ id: 'store' as OrgSection, label: 'Store' }] : []),
];

const QUESTION_FOR_STEP: Partial<Record<SetupStepId, 1 | 2 | 3>> = { kinds: 1, money: 2, payments: 3 };
const STEP_SAVED_LABEL: Record<1 | 2 | 3, string> = { 1: 'What you do', 2: 'Who handles money', 3: 'Payments' };
const OPEN_FOR_KIND: Record<OrgKind, string> = { office: '', field: 'Jobs', school: 'School fees', shop: 'Counter sales' };

/** Which card on this page fixes a checklist item. */
function readinessFixTarget(item: ReadinessItem): ReadinessFixTarget | null {
  const key = String(item.key || '').toLowerCase();
  if (/stage_actor|actor/.test(key)) return 'actors';
  if (/department/.test(key)) return 'departments';
  if (/admin|member|people|role|authorit|delegat/.test(key)) return 'members';
  if (/trusted|issuer|verifier|partner/.test(key)) return 'partners';
  if (/payment|provider|rail/.test(key)) return 'payments';
  if (/profile|organization_profile|name/.test(key)) return 'profile';
  if (/store|catalog/.test(key)) return 'store';
  return null;
}

const READINESS_TITLE_PLAIN: Record<string, string> = {
  organization_profile: 'Organisation name',
  primary_admin: 'An owner or admin',
  active_members: 'At least one team member',
  people_records: 'Team member details',
  departments: 'Departments',
  roles: 'Roles',
  authorities: 'Who can approve what',
  delegations: 'Stand-ins for approvers',
  stage_actor: 'Who does each job step',
  trusted_issuers: 'Trusted partners',
  verifier_registration: 'Checking documents',
  payment_provider: 'A way to pay',
};

const READINESS_FIX_CARD_ID: Record<ReadinessFixTarget, string> = {
  members: 'org-card-members',
  departments: 'org-card-departments',
  actors: 'org-card-actors',
  payments: 'org-card-payments',
  partners: 'org-card-payments',
  profile: 'org-card-store',
  store: 'org-card-store',
};


function plainReadinessTitle(item: ReadinessItem): string {
  return READINESS_TITLE_PLAIN[item.key] || item.title || item.key.replace(/_/g, ' ');
}

function plainReadinessReason(item: ReadinessItem): string {
  return String(item.reason || '')
    .replace(/\bVCs?\b/g, 'records')
    .replace(/\bverifiable credentials?\b/gi, 'records')
    .replace(/\bcredentials?\b/gi, 'records')
    .replace(/\bissuers?\b/gi, 'partners')
    .replace(/\bstage actors?\b/gi, 'the people for each step')
    .replace(/\bworkflow actors?\b/gi, 'the people for each step')
    .replace(/\bpeople records\b/gi, 'team member details');
}

const STORE_PAYMENT_RAIL_OPTIONS = [
  { value: 'AcceptsEcoCash', label: 'EcoCash' },
  { value: 'AcceptsZipit', label: 'ZIPIT' },
  { value: 'AcceptsClicknPay', label: 'ClicknPay' },
  { value: 'AcceptsUsdCash', label: 'USD Cash' },
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
  const [memberList, setMemberList] = useState<Array<{ userId: string; role: string; walletTenantId?: string; status: string; displayName?: string; phone?: string }>>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<string | null>('approver');
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [deptName, setDeptName] = useState('');
  const [deptBusy, setDeptBusy] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);

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
    const who = memberList.find((m) => m.userId === userId);
    if (!window.confirm(`Remove ${personName(who, userId)} from the organization?`)) return;
    try {
      await api.delete(`/api/organizations/${activeId}/members/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
      notifications.show({ title: 'Removed', message: personName(who, userId), color: 'gray' });
      void fetchMembers(activeId);
    } catch (err: any) {
      notifications.show({ title: 'Remove failed', message: err.response?.data?.message ?? err.message, color: 'red' });
    }
  };

  const [actorsView, setActorsView] = useState<WorkflowActorsView | null>(null);
  const [savingActorPolicy, setSavingActorPolicy] = useState(false);
  const [offeringCredentials, setOfferingCredentials] = useState(false);
  const [chainPicker, setChainPicker] = useState<string | null>(null);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [savingActorAction, setSavingActorAction] = useState<string | null>(null);

  // What the organization does (prepares the kinds of requests it uses)
  const [orgKinds, setOrgKinds] = useState<OrgKind[]>(['office']);
  const [orgQuestion, setOrgQuestion] = useState<0 | 1 | 2 | 3>(0);
  const [orgQuestionPreset, setOrgQuestionPreset] = useState('keep_current');
  const [orgQuestionPay, setOrgQuestionPay] = useState<PaymentChoice>('simulated');
  /** Answers saved on the server; null until the owner finishes the questions on any device. */
  const [serverProfile, setServerProfile] = useState<OrgProfile | null>(null);
  /** The settings area open on its own screen; null shows the organisation home. */
  const [section, setSection] = useState<OrgSection | null>(null);
  /** True when one question was opened from the checklist, not the first-run flow. */
  const [orgSingle, setOrgSingle] = useState(false);
  /** Checklist questions still to do after this one. */
  const [orgThen, setOrgThen] = useState<Array<1 | 2 | 3>>([]);
  /** Small "done" screen after saving: which question, or 'all' after the first run. */
  const [orgDone, setOrgDone] = useState<null | 1 | 2 | 3 | 'all'>(null);
  const [branding, setBranding] = useState({ orgName: '', primaryColor: '#228be6' });
  const [activating, setActivating] = useState(false);
  const [activeWorkflowTypes, setActiveWorkflowTypes] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<OrganizationReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<Array<{ id: string; name: string; detail: string; selected: boolean }>>([
    { id: 'clicknpay', name: 'Click n Pay', detail: 'Pay with card', selected: false },
    { id: 'ecocash', name: 'EcoCash', detail: 'Pay via EcoCash', selected: false },
    { id: 'simulated', name: 'Simulated pay', detail: 'Practice payment. No real money moves.', selected: false },
  ]);
  const [setupPartners, setSetupPartners] = useState<Array<{ id: string; name: string; isOwnOrganization: boolean; status: string }>>([]);
  const [partnerName, setPartnerName] = useState('');
  const [partnerRef, setPartnerRef] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const canManageOrgSetup = ['owner', 'admin'].includes(String(getOrgRoleClaim() || '').toLowerCase());

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
      // Configured (not "enabled") workflows: the backend returns `workflowTypes`
      // for everything the org has set up; readiness decides whether they run.
      const configured: string[] = Array.isArray(workflowsRes.data?.workflowTypes)
        ? workflowsRes.data.workflowTypes
        : safeArray(workflowsRes.data?.templates).map((t: any) => String(t.workflowType || t.id || ''));
      const types = configured.filter((value: string) => value.length > 0);
      localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(types));
      setActiveWorkflowTypes(types);
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
    void loadActiveWorkflowTypes();
  }, []);

  const loadOrgSetupExtras = useCallback(async (orgId?: string | null) => {
    const target = orgId || getActiveOrgId();
    if (!target || !['owner', 'admin'].includes(String(getOrgRoleClaim() || '').toLowerCase())) return;
    const token = getPreferredToken() || getWalletToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    try {
      const [pay, partners] = await Promise.all([
        api.get(`/api/organizations/${target}/setup/payments`, { headers }),
        api.get(`/api/organizations/${target}/setup/trusted-partners`, { headers }),
      ]);
      if (Array.isArray(pay.data?.methods) && pay.data.methods.length > 0) setPaymentMethods(pay.data.methods);
      setSetupPartners(partners.data?.partners || []);
    } catch {
      // Readiness still works if these setup endpoints are unavailable.
    }
  }, []);

  const choosePaymentMethod = async (method: string) => {
    if (!activeId || !method) return;
    const token = getPreferredToken() || getWalletToken();
    setSetupBusy(true);
    try {
      const res = await api.post(`/api/organizations/${activeId}/setup/payments`, { method }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (Array.isArray(res.data?.methods) && res.data.methods.length > 0) setPaymentMethods(res.data.methods);
      const chosen = (res.data?.methods || paymentMethods).find((item: { id: string; name: string }) => item.id === method);
      notifications.show({ title: 'Payment method saved', message: chosen ? `${chosen.name} is how this organization takes and releases money.` : 'Saved.', color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Could not save the payment method', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setSetupBusy(false);
    }
  };

  const trustOwnOrganization = async () => {
    if (!activeId) return;
    const token = getPreferredToken() || getWalletToken();
    setSetupBusy(true);
    try {
      const res = await api.post(`/api/organizations/${activeId}/setup/trusted-partners/own`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setSetupPartners(res.data?.partners || []);
      notifications.show({ title: 'This organization is trusted', message: 'Documents you issue here will be accepted.', color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Could not update', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setSetupBusy(false);
    }
  };

  const addTrustedPartner = async () => {
    if (!activeId || !partnerRef.trim()) return;
    const token = getPreferredToken() || getWalletToken();
    setSetupBusy(true);
    try {
      const res = await api.post(`/api/organizations/${activeId}/setup/trusted-partners`, {
        name: partnerName.trim() || undefined,
        reference: partnerRef.trim(),
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setSetupPartners(res.data?.partners || []);
      setPartnerName('');
      setPartnerRef('');
      notifications.show({ title: 'Partner added', message: 'Documents from this partner can now be accepted.', color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Could not add partner', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setSetupBusy(false);
    }
  };

  useEffect(() => {
    if (!activeId) return;
    void loadStoreBasics(activeId);
    void loadWorkflowActorDefaults();
    void fetchMembers(activeId);
    void loadDepartments(activeId);
    void loadActiveWorkflowTypes(activeId);
    void loadReadiness(activeId);
    void loadOrgSetupExtras(activeId);
  }, [activeId, fetchMembers, loadActiveWorkflowTypes, loadReadiness, loadOrgSetupExtras]);

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
      })));
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to load organisations');
    } finally {
      setLoading(false);
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
      // One view for every configured workflow: stage actors, members, role options and fallback policy.
      const res = await api.get(`/api/organizations/${encodeURIComponent(activeId)}/workflows/actors`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setActorsView(res.data ?? null);
    } catch {
      setActorsView(null);
    } finally {
      setActorsLoading(false);
    }
  };

  /** `selected` is `user:<id>`, `role:<key>` or null (clear → fallback policy applies). */
  const saveActorDefault = async (workflowType: string, stageAction: string, selected: string | null) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    const key = `${workflowType}:${stageAction}`;
    setSavingActorAction(key);
    try {
      const body: Record<string, unknown> = { workflowType, stageAction };
      if (!selected) body.enabled = false;
      else if (selected.startsWith(ACTOR_USER_PREFIX)) body.defaultUserId = selected.slice(ACTOR_USER_PREFIX.length);
      else if (selected.startsWith(ACTOR_ROLE_PREFIX)) body.defaultRole = selected.slice(ACTOR_ROLE_PREFIX.length);

      await api.put(`/api/organizations/${encodeURIComponent(activeId)}/workflows/actors/defaults`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });

      notifications.show({
        title: selected ? 'Person saved for this step' : 'Person cleared for this step',
        message: `${humanizeKey(stageAction)} · ${humanizeKey(workflowType)}`,
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

  const saveActorPolicy = async (patch: {
    useBuiltInRoleFallbacks?: boolean;
    ownerFallbackEnabled?: boolean;
    defaultChain?: ActorFallbackEntry[];
    stageChains?: Record<string, ActorFallbackEntry[]>;
    signGroups?: Record<string, 'one' | 'both'>;
  }) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    setSavingActorPolicy(true);
    try {
      await api.patch(`/api/organizations/${encodeURIComponent(activeId)}/workflows/actors/policy`, patch, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadWorkflowActorDefaults();
    } catch (err: any) {
      notifications.show({
        title: 'Policy update failed',
        message: err?.response?.data?.message || err?.message || 'Could not update fallback policy.',
        color: 'red',
      });
    } finally {
      setSavingActorPolicy(false);
    }
  };

  const loadDepartments = async (orgId: string) => {
    const token = getPreferredToken();
    if (!token || !orgId) return;
    try {
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgId)}/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = Array.isArray(res.data) ? res.data : safeArray(res.data?.departments);
      setDepartments(list);
    } catch {
      setDepartments([]);
    }
  };

  const addDepartment = async () => {
    const token = getPreferredToken();
    if (!token || !activeId || !deptName.trim()) return;
    setDeptBusy(true);
    try {
      await api.post(`/api/organizations/${encodeURIComponent(activeId)}/departments`, { name: deptName.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeptName('');
      notifications.show({ title: 'Department added', message: deptName.trim(), color: 'green' });
      await loadDepartments(activeId);
    } catch (err: any) {
      notifications.show({ title: 'Could not add department', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setDeptBusy(false);
    }
  };

  const applyActorPreset = async (presetId: string) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    setApplyingPreset(presetId);
    try {
      const res = await api.post(`/api/organizations/${encodeURIComponent(activeId)}/workflows/actors/presets`, { presetId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActorsView(res.data ?? null);
      notifications.show({ title: 'Setup applied', message: 'Purchase-request steps now follow this setup.', color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Could not apply setup', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setApplyingPreset(null);
    }
  };

  const changeMemberRole = async (userId: string, role: string | null) => {
    const token = getPreferredToken();
    if (!token || !activeId || !role) return;
    setChangingRole(userId);
    try {
      await api.patch(`/api/organizations/${encodeURIComponent(activeId)}/members/${encodeURIComponent(userId)}`, { role }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      notifications.show({ title: 'Role updated', message: ROLE_LABELS[role] || humanizeKey(role), color: 'green' });
      await fetchMembers(activeId);
    } catch (err: any) {
      notifications.show({ title: 'Could not change role', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setChangingRole(null);
    }
  };


  const offerActorCredentials = async () => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    setOfferingCredentials(true);
    try {
      const res = await api.post(`/api/organizations/${encodeURIComponent(activeId)}/workflows/actors/offer-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const offered = safeArray(res.data?.offered).length;
      const covered = safeArray(res.data?.alreadyCovered).length;
      notifications.show({
        title: 'Role cards',
        message: offered > 0 ? `${offered} role card${offered === 1 ? '' : 's'} sent to team members' wallets.` : `${covered} ${covered === 1 ? 'person' : 'people'} already have theirs.`,
        color: 'green',
      });
      await loadWorkflowActorDefaults();
    } catch (err: any) {
      notifications.show({
        title: 'Could not offer credentials',
        message: err?.response?.data?.message || err?.message || 'Offer failed.',
        color: 'red',
      });
    } finally {
      setOfferingCredentials(false);
    }
  };

  const actorPickerOptions = useMemo(() => {
    if (!actorsView) return [];
    return [
      {
        group: 'People',
        items: actorsView.members.map((member) => ({
          value: `${ACTOR_USER_PREFIX}${member.userId}`,
          label: `${personName(member)} · ${ROLE_LABELS[member.role] || humanizeKey(member.role)}${member.walletTenantId ? '' : ' (no wallet)'}`,
          disabled: !member.walletTenantId,
        })),
      },
      { group: 'Roles', items: actorsView.roles.map((role) => ({ value: `${ACTOR_ROLE_PREFIX}${role}`, label: humanizeKey(role) })) },
    ];
  }, [actorsView]);

  const setupSteps = useMemo(
    () => setupChecklist({ profile: serverProfile || readOrgProfile(), items: readiness?.items ?? [], memberCount: memberList.length }),
    [serverProfile, readiness, memberList],
  );
  const moneyActorGapTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const wf of actorsView?.workflows ?? []) {
      for (const s of wf.stages) {
        if (s.moneyStep && s.needsAssignment) titles.add(shortStepTitle(s.stageAction, s.title));
      }
    }
    return [...titles];
  }, [actorsView]);
  const moneyActorGaps = moneyActorGapTitles.length > 0;
  /** Request types where the owner opened "Use someone else" for the money steps. */
  const [moneyOverrideOpen, setMoneyOverrideOpen] = useState<Record<string, boolean>>({});
  /** One category per screen inside Who does what: money, each kind of request, backups, role cards. */
  const [actorTab, setActorTab] = useState('money');
  const actorTabs = useMemo(() => {
    const requests = (actorsView?.workflows ?? [])
      .filter((workflow) => !isPurchaseRequests(workflow) || workflow.stages.some((stage) => !stage.moneyStep))
      .map((workflow) => ({ id: workflow.workflowType, label: plainRequestName(workflow) }));
    return [{ id: 'money', label: 'Money' }, ...requests, { id: 'backups', label: 'If nobody is chosen' }, { id: 'cards', label: 'Role cards' }];
  }, [actorsView]);
  const actorTabIndex = Math.max(0, actorTabs.findIndex((tab) => tab.id === actorTab));
  const currentActorTab = actorTabs[actorTabIndex]?.id;
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
          title: 'Ways to pay saved',
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

      applyOrgContext({ orgId, orgName: orgLabel, orgToken: token, orgRole, sector, workflowTypes });
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

  // ── Create org (name only — workflows are configured afterwards and gated by readiness) ──

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = getWalletToken();
      const res = await api.post(
        '/api/organizations',
        { name: newOrgName.trim() },
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

  // ── What the organization does → which kinds of requests are prepared ──


  useEffect(() => {
    if (serverProfile && serverProfile.kinds.length > 0) {
      setOrgKinds(serverProfile.kinds);
      return;
    }
    const kinds = new Set<OrgKind>(kindsFromRequestTypes(activeWorkflowTypes));
    if (kinds.size === 0) kinds.add('office');
    setOrgKinds(Array.from(kinds));
  }, [activeWorkflowTypes, serverProfile]);

  useEffect(() => {
    if (!activeId) return;
    const token = getPreferredToken() || getWalletToken();
    let cancelled = false;
    api
      .get(`/api/organizations/${activeId}${SETUP_PROFILE_PATH}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      .then((res) => {
        if (cancelled) return;
        const server = profileFromServer(res.data);
        setServerProfile(server);
        if (server) {
          persistOrgProfile(server);
          setOrgQuestion(0);
        }
      })
      .catch(() => {
        /* the local copy decides */
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!canManageOrgSetup || !activeId) return;
    if (readOrgProfile()) {
      setOrgQuestion(0);
      return;
    }
    setOrgQuestion((current) => (current === 0 ? 1 : current));
  }, [canManageOrgSetup, activeId]);

  const finishOrgQuestions = async () => {
    const profile: OrgProfile = {
      kinds: orgKinds,
      approvalPresetId: orgQuestionPreset === 'keep_current' ? serverProfile?.approvalPresetId || '' : orgQuestionPreset,
      approvalTitle:
        orgQuestionPreset === 'keep_current'
          ? serverProfile?.approvalTitle || 'People chosen under Who does what'
          : (actorsView?.presets || []).find((preset) => preset.id === orgQuestionPreset)?.title || '',
      paymentChoice: orgQuestionPay,
      completedAt: new Date().toISOString(),
    };
    const saved = await saveOrgKinds(profile);
    if (!saved) return;
    if (orgQuestionPreset && orgQuestionPreset !== 'keep_current') {
      await applyActorPreset(orgQuestionPreset);
    }
    if (orgQuestionPay !== 'none') {
      await choosePaymentMethod(orgQuestionPay);
    }
    persistOrgProfile(profile);
    setOrgQuestion(0);
    setOrgDone('all');
  };

  /** Save the one question opened from the checklist, then show a small done screen. */
  const saveSingleQuestion = async () => {
    const question = orgQuestion;
    if (question === 0) return;
    let saved = false;
    if (question === 1) {
      saved = await saveOrgKinds(undefined, { kinds: orgKinds });
    } else if (question === 2) {
      if (orgQuestionPreset && orgQuestionPreset !== 'keep_current') await applyActorPreset(orgQuestionPreset);
      saved = await saveOrgKinds(undefined, {
        approvalPresetId: orgQuestionPreset === 'keep_current' ? serverProfile?.approvalPresetId : orgQuestionPreset,
        approvalTitle:
          orgQuestionPreset === 'keep_current'
            ? serverProfile?.approvalTitle || 'People chosen under Who does what'
            : (actorsView?.presets || []).find((preset) => preset.id === orgQuestionPreset)?.title || '',
      });
    } else {
      if (orgQuestionPay !== 'none') await choosePaymentMethod(orgQuestionPay);
      saved = await saveOrgKinds(undefined, { paymentChoice: orgQuestionPay });
    }
    if (!saved) return;
    setOrgQuestion(0);
    setOrgDone(question);
  };

  const openChecklistStep = (id: SetupStepId, rest: SetupStepId[]) => {
    setOrgDone(null);
    if (id === 'team') {
      setSection('team');
      return;
    }
    const question = QUESTION_FOR_STEP[id];
    if (!question) return;
    setOrgSingle(true);
    setOrgThen(rest.map((step) => QUESTION_FOR_STEP[step]).filter((value): value is 1 | 2 | 3 => Boolean(value)));
    setOrgQuestion(question);
  };

  /** Save the answers. The server works out which kinds of request follow; nothing is named or switched on. */
  const saveOrgKinds = async (profile?: OrgProfile, partial?: Record<string, unknown>): Promise<boolean> => {
    if (!activeId) {
      notifications.show({ title: 'No organization', message: 'Switch to an organization first.', color: 'red' });
      return false;
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

      const body = partial ?? (profile ? profileToServer(profile) : { kinds: orgKinds });
      const res = await api.put(`/api/organizations/${activeId}${SETUP_PROFILE_PATH}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const server = profileFromServer(res.data);
      setServerProfile(server);
      if (server) persistOrgProfile(server);

      await loadActiveWorkflowTypes(activeId);
      await loadReadiness(activeId);
      return true;
    } catch (err: any) {
      notifications.show({
        title: 'Could not save',
        message: err.response?.data?.message ?? err.message ?? 'Please try again.',
        color: 'red',
      });
      return false;
    } finally {
      setActivating(false);
    }
  };

  const renderActorStage = (workflow: { workflowType: string; name?: string }, stage: WorkflowActorStageView) => {
    if (!actorsView) return null;
    const key = `${workflow.workflowType}:${stage.stageAction}`;
    const who = stage.actor.userId || stage.actor.walletTenantId;
    const credential = credentialLabel(stage.credential);
    const named = who ? personName(actorsView.members.find((m) => m.userId === who), who) : '';
    const person = stage.askedOnFirstUse
      ? plainRequestName(workflow) === 'Jobs' ? 'Picked on the first job' : 'Picked the first time'
      : stage.actor.mode === 'shared_finance'
        ? `Same as purchase requests${named ? ` · ${named}` : ''}`
        : stage.needsAssignment
          ? named ? `Needs a person · ${named} for now` : 'Needs a person'
          : named || 'Owner is standing in';
    const onlyHere = stage.moneyStep && !isPurchaseRequests(workflow) && stage.default?.enabled;
    return (
      <Box key={key}>
        <Text size="sm" fw={500}>
          {shortStepTitle(stage.stageAction, stage.title)}
          {onlyHere ? ` · only for ${plainRequestName(workflow).toLowerCase()}` : ''}
        </Text>
        <Text size="xs" c="dimmed">
          {person}
          {credential && !stage.askedOnFirstUse ? ` · ${credential.label}` : ''}
        </Text>
        <Select
          mt={4}
          size="xs"
          placeholder={stage.askedOnFirstUse ? 'Choose now (optional)' : 'Person or role'}
          data={actorPickerOptions}
          value={actorSelectValue(stage.default)}
          clearable
          searchable
          onChange={(next) => saveActorDefault(workflow.workflowType, stage.stageAction, next)}
          disabled={!actorsView.canEdit || savingActorAction === key}
        />
      </Box>
    );
  };

  const answering = section === null && (orgQuestion > 0 || orgDone !== null);

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb={80}>
        {/* ── Header ── */}
        <Box>
          <Title order={3}>Organisation</Title>
        </Box>

        <Divider />
        {error && <ErrorAlert message={error} />}

        {/* ── Create Org ── */}
        {section === null && !answering && (
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setShowCreate((c) => !c)} fullWidth>
          {showCreate ? 'Close' : 'Create Organisation'}
        </Button>
        )}

        {!answering && <Collapse in={showCreate}>
          <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Title order={5}>New Organisation</Title>
              <Text size="xs" c="dimmed">Give it a name. You will answer a few questions about what it does next.</Text>
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
        </Collapse>}

        {/* ── Org List (reused from original) ── */}
        {section !== null || answering ? null : loading ? (
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
            {section === null && orgDone !== null && (
              <Paper p="md" radius="md" withBorder>
                <Stack gap="sm" align="center">
                  <ThemeIcon color="teal" variant="light" radius="xl" size={44}><IconCheck size={22} /></ThemeIcon>
                  <Text fw={700} ta="center">
                    {orgDone === 'all' ? `${activeLabel || 'Your organisation'} is set up` : `${STEP_SAVED_LABEL[orgDone]} saved`}
                  </Text>
                  {orgDone === 'all' && (
                    <Text size="xs" c="dimmed" ta="center">
                      Open now: {['Purchase requests', 'Supplier bills', ...orgKinds.map((kind) => OPEN_FOR_KIND[kind]).filter(Boolean)].join(', ')}.
                      {orgKinds.includes('field') ? ' You pick who goes out on the first job.' : ''}
                    </Text>
                  )}
                  {orgDone !== 'all' && orgThen.length > 0 ? (
                    <Button
                      size="sm"
                      fullWidth
                      rightSection={<IconArrowRight size={14} />}
                      onClick={() => {
                        const [next, ...rest] = orgThen;
                        setOrgThen(rest);
                        setOrgDone(null);
                        setOrgSingle(true);
                        setOrgQuestion(next);
                      }}
                    >
                      Next: {STEP_SAVED_LABEL[orgThen[0]]}
                    </Button>
                  ) : orgDone === 'all' ? (
                    <Button size="sm" fullWidth rightSection={<IconArrowRight size={14} />} onClick={() => { setOrgDone(null); setSection('team'); }}>
                      Invite your team
                    </Button>
                  ) : null}
                  <Button size="xs" variant="subtle" onClick={() => { setOrgDone(null); setOrgThen([]); }}>
                    {orgThen.length > 0 && orgDone !== 'all' ? 'Finish later' : 'Back to setup'}
                  </Button>
                </Stack>
              </Paper>
            )}
            {section === null && canManageOrgSetup && orgQuestion > 0 && (
              <Paper p="md" radius="md" withBorder>
                <Stack gap="sm">
                  <Progress value={(orgQuestion / 3) * 100} size="sm" radius="xl" aria-label="Progress" />
                  <Text size="xs" c="dimmed">Question {orgQuestion} of 3</Text>
                  <Text fw={700}>
                    {orgQuestion === 1
                      ? 'What does your organization do?'
                      : orgQuestion === 2
                        ? 'Who approves and releases money?'
                        : 'How do you take payments?'}
                  </Text>
                  {orgQuestion === 1 && (
                    <Chip.Group multiple value={orgKinds} onChange={(value) => setOrgKinds(value as OrgKind[])}>
                      <Stack gap={6}>
                        {ORG_KIND_OPTIONS.map((option) => (
                          <Chip key={option.id} value={option.id} radius="md" variant="outline">
                            {option.label}
                          </Chip>
                        ))}
                      </Stack>
                    </Chip.Group>
                  )}
                  {orgQuestion === 2 && (
                    <Stack gap={6}>
                      <Button size="sm" variant={orgQuestionPreset === 'keep_current' ? 'filled' : 'light'} onClick={() => setOrgQuestionPreset('keep_current')}>
                        Keep what is set now
                      </Button>
                      {(actorsView?.presets || []).map((preset) => (
                        <Button
                          key={preset.id}
                          size="sm"
                          variant={orgQuestionPreset === preset.id ? 'filled' : 'light'}
                          onClick={() => setOrgQuestionPreset(preset.id)}
                        >
                          {preset.title}
                        </Button>
                      ))}
                    </Stack>
                  )}
                  {orgQuestion === 3 && (
                    <Stack gap={6}>
                      {PAYMENT_CHOICES.map((choice) => (
                        <Button
                          key={choice.id}
                          size="sm"
                          variant={orgQuestionPay === choice.id ? 'filled' : 'light'}
                          onClick={() => setOrgQuestionPay(choice.id)}
                        >
                          {choice.label}
                        </Button>
                      ))}
                    </Stack>
                  )}
                  {orgSingle ? (
                    <Group justify="space-between">
                      <Button size="xs" variant="subtle" color="gray" onClick={() => { setOrgQuestion(0); setOrgSingle(false); setOrgThen([]); }}>
                        Cancel
                      </Button>
                      <Button size="xs" loading={activating || setupBusy} disabled={orgQuestion === 1 && orgKinds.length === 0} onClick={() => void saveSingleQuestion()}>
                        Save
                      </Button>
                    </Group>
                  ) : (
                  <Group justify="space-between">
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        if (orgQuestion === 1) {
                          persistOrgProfile({ kinds: orgKinds, approvalPresetId: '', approvalTitle: '', paymentChoice: 'none', completedAt: '' });
                          setOrgQuestion(0);
                          return;
                        }
                        setOrgQuestion((current) => (current - 1) as 1 | 2 | 3);
                      }}
                    >
                      {orgQuestion === 1 ? "I'll answer later" : 'Back'}
                    </Button>
                    {orgQuestion < 3 ? (
                      <Button size="xs" disabled={orgQuestion === 1 && orgKinds.length === 0} onClick={() => setOrgQuestion((current) => (current + 1) as 1 | 2 | 3)}>
                        Continue
                      </Button>
                    ) : (
                      <Button size="xs" loading={activating || setupBusy} onClick={() => void finishOrgQuestions()}>
                        Finish
                      </Button>
                    )}
                  </Group>
                  )}
                </Stack>
              </Paper>
            )}
            {section === null && orgQuestion === 0 && orgDone === null && (
            <Paper p="md" radius="md" withBorder>
              <Stack gap="xs">
                <Text fw={700}>Setup</Text>
                {readinessLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : readiness ? (
                  <>
                    {(() => {
                      const doneCount = setupSteps.filter((step) => step.done).length;
                      const firstOpen = setupSteps.find((step) => !step.done);
                      return (
                        <Stack gap={8}>
                          <Text size="sm" c={firstOpen ? 'dimmed' : 'teal'}>
                            {firstOpen ? `${doneCount} of ${setupSteps.length} done` : 'You are set. Everything is in place.'}
                          </Text>
                          <Progress value={(doneCount / setupSteps.length) * 100} size="sm" radius="xl" aria-label="Setup progress" />
                          {setupSteps.map((step) => {
                            const isNext = firstOpen?.id === step.id;
                            const rest = setupSteps.filter((other) => !other.done && other.id !== step.id).map((other) => other.id);
                            return (
                              <Group key={step.id} justify="space-between" wrap="nowrap">
                                <Group gap="xs" wrap="nowrap">
                                  <ThemeIcon radius="xl" size="sm" color={step.done ? 'teal' : 'gray'} variant={step.done ? 'filled' : 'light'}>
                                    {step.done ? <IconCheck size={12} /> : null}
                                  </ThemeIcon>
                                  <Text size="sm" fw={isNext ? 600 : 400} c={step.done ? 'dimmed' : undefined}>{step.label}</Text>
                                </Group>
                                {canManageOrgSetup && (
                                  <Button size="compact-xs" variant={isNext ? 'filled' : 'subtle'} onClick={() => openChecklistStep(step.id, rest)}>
                                    {isNext ? 'Start' : step.done ? 'Change' : 'Open'}
                                  </Button>
                                )}
                              </Group>
                            );
                          })}
                          <Divider my={4} />
                          <Text size="xs" fw={600}>Kinds of requests</Text>
                        </Stack>
                      );
                    })()}
                    {(readiness.workflows ?? []).map((workflow) => {
                      const gaps = readiness.items.filter(
                        (item) =>
                          item.status !== 'ready' &&
                          item.status !== 'optional' &&
                          item.key !== 'request_types_ready' &&
      ((item.requiredFor ?? []).includes(workflow.workflowType) || workflow.blocking.includes(item.key)),
                      );
                      return (
                        <Text key={workflow.templateId || workflow.workflowType} size="sm">
                          {plainRequestName(workflow)}
                          {workflow.ready
                            ? readiness.items.some((item) => item.askedOnFirstUse && (item.requiredFor ?? []).includes(workflow.workflowType))
                              ? plainRequestName(workflow) === 'Jobs' ? ' · Open · you pick who goes out on the first job' : ' · Open · the rest is asked the first time'
                              : ' · Open'
                            : gaps.length > 0 ? ` · ${gaps.map(plainReadinessTitle).join(', ')}` : ' · Still to do'}
                        </Text>
                      );
                    })}
                    {readiness.items
                      .filter((item) => item.status === 'needs_attention' || item.status === 'pending_external')
                      .filter((item) => !['workflow_configuration', 'payment_provider', 'active_members', 'request_types_ready'].includes(item.key) && !item.key.startsWith('stage_actor:'))
                      .map((item) => {
                        const target = readinessFixTarget(item);
                        return (
                          <Group key={item.key} justify="space-between" wrap="nowrap">
                            <Text size="sm">{plainReadinessTitle(item)}</Text>
                            {target && item.status !== 'pending_external' ? (
                              <Button size="compact-xs" variant="subtle" onClick={() => setSection(SECTION_FOR_FIX[target])}>
                                Open
                              </Button>
                            ) : (
                              <Text size="xs" c="dimmed">Waiting</Text>
                            )}
                          </Group>
                        );
                      })}
                  </>
                ) : (
                  <Text size="xs" c="dimmed">Choose an organisation first.</Text>
                )}
              </Stack>
            </Paper>
            )}

            {section === null && orgQuestion === 0 && orgDone === null && (
              <Paper p="md" radius="md" withBorder>
                <Stack gap={4}>
                  <Text fw={700}>Settings</Text>
                  {SECTION_LABELS.filter((item) => canManageOrgSetup || !['payments', 'departments'].includes(item.id)).map((item) => (
                    <Group key={item.id} justify="space-between" wrap="nowrap" style={{ cursor: 'pointer' }} onClick={() => setSection(item.id)}>
                      <Text size="sm">{item.label}</Text>
                      <IconArrowRight size={14} />
                    </Group>
                  ))}
                </Stack>
              </Paper>
            )}

            {section !== null && (
              <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => setSection(null)} style={{ alignSelf: 'flex-start' }}>
                Organisation
              </Button>
            )}

            {section === 'payments' && canManageOrgSetup && (
              <Paper id="org-card-payments" p="md" radius="md" withBorder>
                <Stack gap="sm">
                  <Text fw={700}>Payments</Text>
                  <Radio.Group
                    value={paymentMethods.find((method) => method.selected)?.id || ''}
                    onChange={(value) => void choosePaymentMethod(value)}
                  >
                    <Stack gap={6}>
                      {paymentMethods.map((method) => (
                        <Radio
                          key={method.id}
                          value={method.id}
                          disabled={setupBusy}
                          label={method.name}
                          description={method.detail}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                  <Button size="xs" variant="light" loading={setupBusy} disabled={setupPartners.some((item) => item.isOwnOrganization && item.status === 'active')} onClick={() => void trustOwnOrganization()}>
                    {setupPartners.some((item) => item.isOwnOrganization && item.status === 'active') ? 'Our documents are accepted' : 'Accept our documents'}
                  </Button>
                  <TextInput size="xs" label="Partner name" value={partnerName} onChange={(e) => setPartnerName(e.currentTarget.value)} />
                  <TextInput size="xs" label="Identifier they gave you" value={partnerRef} onChange={(e) => setPartnerRef(e.currentTarget.value)} />
                  <Button size="xs" variant="light" disabled={!partnerRef.trim()} loading={setupBusy} onClick={() => void addTrustedPartner()}>
                    Add partner
                  </Button>
                  {setupPartners.filter((item) => item.status === 'active').map((item) => (
                    <Text key={item.id} size="xs">{item.name}{item.isOwnOrganization ? ' (this organization)' : ''}</Text>
                  ))}
                </Stack>
              </Paper>
            )}

            {section === 'departments' && canManageOrgSetup && (
              <Paper id="org-card-departments" p="md" radius="md" withBorder>
                <Stack gap="sm">
                  <Text fw={700}>Departments</Text>
                  {departments.length === 0 ? (
                    <Text size="xs" c="dimmed">No departments yet.</Text>
                  ) : (
                    departments.map((dept) => (
                      <Text key={dept.id} size="xs">{dept.name}{dept.code ? ` · ${dept.code}` : ''}</Text>
                    ))
                  )}
                  <Group gap="xs" wrap="nowrap">
                    <TextInput
                      style={{ flex: 1 }}
                      size="xs"
                      placeholder="Department name"
                      value={deptName}
                      onChange={(e) => setDeptName(e.currentTarget.value)}
                    />
                    <Button size="xs" loading={deptBusy} disabled={!deptName.trim()} onClick={() => void addDepartment()}>
                      Add
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}

            {section === 'actors' && (
            <Paper id="org-card-actors" p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700}>Who does what</Text>
                {actorsView && (
                  <Stack gap={6}>
                    <Progress value={((actorTabIndex + 1) / actorTabs.length) * 100} size="sm" radius="xl" aria-label="Progress" />
                    <Group gap={6}>
                      {actorTabs.map((tab) => (
                        <Button key={tab.id} size="compact-xs" radius="xl" variant={tab.id === currentActorTab ? 'filled' : 'light'} onClick={() => setActorTab(tab.id)}>
                          {tab.label}
                        </Button>
                      ))}
                    </Group>
                  </Stack>
                )}
                {currentActorTab === 'cards' && (
                  <Stack gap={6}>
                    <Text size="xs" c="dimmed">Each person accepts a role card in the app.</Text>
                    {actorsView?.canEdit && (
                      <Button size="xs" variant="light" loading={offeringCredentials} onClick={offerActorCredentials}>
                        Send role cards
                      </Button>
                    )}
                  </Stack>
                )}
                {actorsView && currentActorTab === 'money' && (
                  <Stack gap="xs">
                    <Text size="xs" fw={600}>Who approves and releases money</Text>
                    <Group gap="xs">
                      {(actorsView.presets || []).map((preset) => (
                        <Button
                          key={preset.id}
                          size="xs"
                          variant="light"
                          loading={applyingPreset === preset.id}
                          disabled={!actorsView.canEdit || (applyingPreset !== null && applyingPreset !== preset.id)}
                          onClick={() => void applyActorPreset(preset.id)}
                        >
                          {preset.title}
                        </Button>
                      ))}
                    </Group>
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      disabled={!actorsView.canEdit || savingActorPolicy}
                      value={actorsView.policy.signGroups?.requisition_approval === 'one' ? 'one' : 'both'}
                      onChange={(value) => void saveActorPolicy({ signGroups: { requisition_approval: value === 'one' ? 'one' : 'both' } })}
                      data={[
                        { value: 'one', label: 'One person confirms' },
                        { value: 'both', label: 'Each confirms' },
                      ]}
                    />
                    {(() => {
                      const purchases = actorsView.workflows.find(isPurchaseRequests);
                      return purchases ? purchases.stages.filter((stage) => stage.moneyStep).map((stage) => renderActorStage(purchases, stage)) : null;
                    })()}
                    <Text size="xs" c={moneyActorGaps ? 'orange' : 'dimmed'}>
                      {moneyActorGaps ? `Still needs a person: ${moneyActorGapTitles.join(', ')}.` : 'Every request uses these people unless you change one on its own screen.'}
                    </Text>
                  </Stack>
                )}

                {actorsLoading && !actorsView ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : !actorsView ? (
                  <Text size="xs" c="dimmed">Choose an organisation first.</Text>
                ) : (
                  <Stack gap="sm">
                    {!actorsView.canEdit && (
                      <Alert variant="light" color="yellow"><Text size="xs">Only an owner can change who does what.</Text></Alert>
                    )}

                    {actorsView.workflows.filter((workflow) => workflow.workflowType === currentActorTab).map((workflow) => {
                      const own = workflow.stages.filter((stage) => !stage.moneyStep);
                      const money = workflow.stages.filter((stage) => stage.moneyStep);
                      const onTheJob = plainRequestName(workflow) === 'Jobs';
                      const assignHere = onTheJob ? [] : own.filter((stage) => !stage.askedOnFirstUse);
                      if (isPurchaseRequests(workflow) && assignHere.length === 0) return null;
                      const namedOnTheJob = onTheJob
                        ? own
                            .filter((stage) => stage.actor.userId || stage.actor.walletTenantId)
                            .map((stage) => {
                              const who = stage.actor.userId || stage.actor.walletTenantId || '';
                              return `${shortStepTitle(stage.stageAction, stage.title)}: ${personName(actorsView.members.find((member) => member.userId === who), who)}`;
                            })
                        : [];
                      const overridden = money.some((stage) => stage.default?.enabled);
                      const open = Boolean(moneyOverrideOpen[workflow.workflowType]) || overridden;
                      const showMoney = !isPurchaseRequests(workflow) && money.length > 0;
                      return (
                        <Box key={workflow.templateId || workflow.workflowType}>
                          <Text size="sm" fw={600} mb={4}>{plainRequestName(workflow)}</Text>
                          <Stack gap="xs">
                            {onTheJob && (
                              <Text size="xs" c="dimmed">
                                Who goes out and who checks the work is asked when you create a job.
                                {namedOnTheJob.length > 0 ? ` Right now, ${namedOnTheJob.join('. ')}.` : ''}
                              </Text>
                            )}
                            {!onTheJob && own.some((stage) => stage.askedOnFirstUse) && (
                              <Text size="xs" c="dimmed">The other people are asked the first time you use this.</Text>
                            )}
                            {assignHere.map((stage) => renderActorStage(workflow, stage))}
                            {showMoney && !open && (
                              <Group justify="space-between" wrap="nowrap">
                                <Text size="xs" c="dimmed">Money steps · same as purchase requests</Text>
                                {actorsView.canEdit && (
                                  <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    onClick={() => setMoneyOverrideOpen((current) => ({ ...current, [workflow.workflowType]: true }))}
                                  >
                                    Use someone else
                                  </Button>
                                )}
                              </Group>
                            )}
                            {showMoney && open && money.map((stage) => renderActorStage(workflow, stage))}
                          </Stack>
                        </Box>
                      );
                    })}

                    {currentActorTab === 'backups' && (
                    <>
                    <Text size="xs" fw={600}>If nobody is chosen</Text>
                    <Checkbox
                      size="xs"
                      label="Use the usual role order"
                      checked={actorsView.policy.useBuiltInRoleFallbacks}
                      disabled={!actorsView.canEdit || savingActorPolicy}
                      onChange={(e) => saveActorPolicy({ useBuiltInRoleFallbacks: e.currentTarget.checked })}
                    />
                    <Checkbox
                      size="xs"
                      label="Owner can stand in"
                      checked={actorsView.policy.ownerFallbackEnabled}
                      disabled={!actorsView.canEdit || savingActorPolicy}
                      onChange={(e) => saveActorPolicy({ ownerFallbackEnabled: e.currentTarget.checked })}
                    />
                    <Stack gap={4}>
                      {(actorsView.policy.defaultChain || []).length === 0 ? (
                        <Text size="xs" c="dimmed">No backup list yet.</Text>
                      ) : (
                        actorsView.policy.defaultChain.map((entry, index) => (
                          <Group key={`${entry.type}:${entry.value}`} justify="space-between" wrap="nowrap">
                            <Text size="xs">
                              {index + 1}. {entry.type === 'role' ? humanizeKey(entry.value) : personName(actorsView.members.find((m) => m.userId === entry.value), entry.value)}
                            </Text>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              disabled={!actorsView.canEdit || savingActorPolicy}
                              onClick={() => saveActorPolicy({
                                defaultChain: actorsView.policy.defaultChain.filter((_, itemIndex) => itemIndex !== index),
                              })}
                            >
                              Remove
                            </Button>
                          </Group>
                        ))
                      )}
                      <Group gap="xs" wrap="nowrap">
                        <Select
                          style={{ flex: 1 }}
                          size="xs"
                          placeholder="Add a backup"
                          data={actorPickerOptions}
                          value={chainPicker}
                          onChange={setChainPicker}
                          searchable
                          disabled={!actorsView.canEdit || savingActorPolicy}
                        />
                        <Button
                          size="xs"
                          variant="light"
                          disabled={!actorsView.canEdit || savingActorPolicy || !chainPicker}
                          onClick={() => {
                            if (!chainPicker) return;
                            const entry: ActorFallbackEntry = chainPicker.startsWith(ACTOR_USER_PREFIX)
                              ? { type: 'user', value: chainPicker.slice(ACTOR_USER_PREFIX.length) }
                              : { type: 'role', value: chainPicker.slice(ACTOR_ROLE_PREFIX.length) };
                            const chain = actorsView.policy.defaultChain || [];
                            if (chain.some((item) => item.type === entry.type && item.value === entry.value)) return;
                            setChainPicker(null);
                            void saveActorPolicy({ defaultChain: [...chain, entry] });
                          }}
                        >
                          Add
                        </Button>
                      </Group>
                    </Stack>
                    </>
                    )}
                    <Group justify="space-between">
                      <Button size="xs" variant="subtle" color="gray" disabled={actorTabIndex === 0} onClick={() => setActorTab(actorTabs[actorTabIndex - 1]?.id || 'money')}>
                        Back
                      </Button>
                      {actorTabIndex < actorTabs.length - 1 ? (
                        <Button size="xs" rightSection={<IconArrowRight size={12} />} onClick={() => setActorTab(actorTabs[actorTabIndex + 1].id)}>
                          Next: {actorTabs[actorTabIndex + 1].label}
                        </Button>
                      ) : (
                        <Button size="xs" onClick={() => setSection(null)}>Done</Button>
                      )}
                    </Group>
                  </Stack>
                )}
              </Stack>
            </Paper>

            )}

            {section === 'handoffs' && <HandoffSettingsCard orgTenantId={activeId} canEdit={canManageOrgSetup} />}

            {/* ── Member Management ── */}
            {section === 'team' && (
            <Paper id="org-card-members" p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="start">
                  <Box>
                    <Group gap="xs"><IconUsers size={18} color="var(--mantine-color-indigo-6)" /><Text fw={700}>Team Members</Text></Group>
                    <Text size="xs" c="dimmed" mt={4}>Invite, manage roles, and remove members from this organisation.</Text>
                  </Box>
                  {canManageOrgSetup && (
                    <Button size="xs" leftSection={<IconUserPlus size={14} />} onClick={() => setShowInvite((s) => !s)}>Invite</Button>
                  )}
                </Group>

                <Collapse in={showInvite && canManageOrgSetup}>
                  <Paper p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <TextInput label="Phone number" placeholder="+263..." value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} size="xs" />
                      <Select label="Role" size="xs" value={inviteRole} onChange={setInviteRole} data={[
                        { value: 'approver', label: 'Approver' },
                        { value: 'manager', label: 'Manager' },
                        { value: 'finance_manager', label: 'Finance Officer' },
                        { value: 'director', label: 'Director' },
                        { value: 'field_worker', label: 'Field Worker' },
                        { value: 'supervisor', label: 'Supervisor / Inspector' },
                        { value: 'dispatcher', label: 'Dispatcher' },
                        { value: 'member', label: 'Team member (sign-off, general)' },
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
                  <Text size="xs" c="dimmed">{canManageOrgSetup ? 'No members yet. Invite your team above.' : 'No other members yet.'}</Text>
                ) : (
                  <Stack gap="xs">
                    {memberList.map((m) => (
                      <Paper key={m.userId} p="xs" radius="sm" withBorder>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs" fw={600} truncate>{personName(m)}</Text>
                            {m.phone && personName(m) !== m.phone && <Text size="10px" c="dimmed">{m.phone}</Text>}
                            <Group gap={4} mt={2}>
                              {canManageOrgSetup && m.role !== 'owner' ? (
                                <Select
                                  size="xs"
                                  data={MEMBER_ROLE_CHOICES.some((choice) => choice.value === m.role) ? MEMBER_ROLE_CHOICES : [...MEMBER_ROLE_CHOICES, { value: m.role, label: ROLE_LABELS[m.role] || humanizeKey(m.role) }]}
                                  value={m.role}
                                  disabled={changingRole === m.userId}
                                  onChange={(value) => void changeMemberRole(m.userId, value)}
                                  allowDeselect={false}
                                  style={{ width: 150 }}
                                />
                              ) : (
                                <Badge size="xs" variant="light" color="indigo">{ROLE_LABELS[m.role] || humanizeKey(m.role)}</Badge>
                              )}
                              {m.walletTenantId && <Badge size="xs" variant="dot" color="teal">App installed</Badge>}
                              <Badge size="xs" variant="light" color={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? 'Active' : m.status === 'suspended' ? 'Suspended' : 'Invited'}</Badge>
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
            )}

            {SHOW_STORE_SECTION && section === 'store' && (
            <>
            <Paper id="org-card-store" p="md" radius="md" withBorder>
              <Stack gap="md">
                <Group justify="space-between" align="start">
                  <Box>
                    <Group gap="xs">
                      <IconBuildingStore size={18} color="var(--mantine-color-teal-6)" />
                      <Text fw={700}>Store</Text>
                    </Group>
                  </Box>
                </Group>

                {storeLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : (
                  <>
                    <Stack gap={6}>
                      <Text size="xs" fw={600}>Who can find it</Text>
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
                          Save
                        </Button>
                      </Group>
                    </Stack>

                    <Stack gap={6}>
                      <Text size="xs" fw={600}>Ways to pay</Text>
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
                          Save
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
                      How customers see this organization.
                    </Text>
                  </Box>
                  <Badge variant="light" color={storefront?.isPublic === false ? 'gray' : 'blue'}>
                    {storefront?.displayName || activeLabel || 'Organization Store'}
                  </Badge>
                </Group>

                <Text size="sm">
                  {storefront?.isPublic === false ? 'Private' : 'Public'}
                  {` · ${storefront?.services?.length || 0} services · ${storefront?.catalogItems?.length || 0} products`}
                </Text>

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
            </>
            )}
          </Stack>
        )}

      </Stack>

    </AppShellMobile>
  );
}
