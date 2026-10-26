import { feedback } from '@/lib/feedback';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { LottiePlayer } from '@/components/feedback/LottiePlayer';
import { GuidedSteps } from '@/components/feedback/GuidedSteps';
import {
  Stack, Title, Text, Box, Divider, Button, Group, Checkbox, TextInput, Alert, Loader, Center,
  Paper, Badge, Collapse, Stepper, SimpleGrid, ThemeIcon, Card, ColorInput, ScrollArea, Select, MultiSelect,
  SegmentedControl, Modal, Radio, Chip, Progress, UnstyledButton,
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
import { StepHelp } from '@/components/help/StepHelp';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { SectionTip } from '@/components/guides/SectionGuides';
import { reveal } from '../../../shared/reveal';
import BottomSheet from '@/components/shared/BottomSheet';
import ErrorAlert from '@/components/shared/ErrorAlert';
import HandoffSettingsCard from '@/components/shared/HandoffSettingsCard';
import RecordSettingsCard from '@/components/shared/RecordSettingsCard';
import DeviceTrustSettingsCard from '@/components/shared/DeviceTrustSettingsCard';
import WhatsAppAlertsCard from '@/components/shared/WhatsAppAlertsCard';
import PublicOfferingsCard from '@/components/org/PublicOfferingsCard';
import OrgPermissionsSettings from '@/components/shared/OrgPermissionsSettings';
import api, { safeArray } from '@/lib/api';
import BrandEditor from '@/components/org/BrandEditor';
import { getActiveOrgLabel, getActiveOrgId, getWalletToken, getPreferredToken, applyOrgContext, getOrgRoleClaim, decodeJwtPayload } from '@/lib/auth';
import {
  CARD_STATE_COLOR, CARD_STATE_LABEL, MY_SUMMARY_LABEL, ONBOARDING_PATH, SUMMARY_COLOR, SUMMARY_LABEL,
  DEFAULT_STAFF_CARD_CHANGE, STAFF_CARD_CHANGE_OPTIONS,
  cardCanResend, cardPurpose, cardResendHint, memberAccessBadge, myOnboardingSteps, readyCount, sendCardsPath, staffCardChangeRule,
  type MemberCardKind, type MemberOnboarding, type StaffCardChangeRule,
} from '@/lib/orgOnboarding';
import { MONEY_CHOICES, ORG_KIND_OPTIONS, ORG_MODULE_OPTIONS, PAYMENT_CHOICES, SETUP_PROFILE_PATH, TEAM_ROLE_FALLBACK, kindsFromRequestTypes, markOrgSetupLater, modulePlanNote, orgSetupLater, persistOrgProfile, profileFromServer, profileToServer, readOrgProfile, setupChecklist, teamRolesFromCatalog, type OrgKind, type OrgModule, type OrgProfile, type PaymentChoice, type SetupStepId } from '@/lib/orgProfile';
import { SETUP_BOOTSTRAP_PATH, bootstrapRequest, cleanDepartmentNames, suggestedDepartmentsFor, suggestedOrgModules, type OrgOperatingModel, type OrgSetupPlan } from '@/lib/orgProfile';

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
  auditor: 'Auditor',
};

function formatAccessDate(value?: string): string {
  if (!value) return 'further notice';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface WorkflowActorDefault {
  id: string;
  workflowType: string;
  stageAction: string;
  defaultRole?: string;
  defaultUserId?: string;
  defaultWalletTenantId?: string;
  /** Other people who may also decide this step (any one of them is enough). */
  additionalUserIds?: string[];
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
  /** Decision steps: how each named person is allowed to approve. */
  access?: StageApprovalAccess[];
}

/** role/grant: they can approve anyway. delegation: time-limited access given by Who does what. */
interface StageApprovalAccess {
  userId: string;
  via: 'role' | 'grant' | 'delegation' | 'expired' | 'none';
  validUntil?: string;
  delegationId?: string;
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

type ReadinessFixTarget = 'members' | 'actors' | 'payments' | 'partners' | 'profile' | 'store' | 'departments' | 'roles' | 'authorities';

/** One settings area per screen. `null` is the organisation home. */
type OrgSection = 'brand' | 'team' | 'actors' | 'payments' | 'departments' | 'handoffs' | 'records' | 'store' | 'roles' | 'authorities' | 'alerts';

const SECTION_FOR_FIX: Record<ReadinessFixTarget, OrgSection> = {
  members: 'team',
  roles: 'roles',
  authorities: 'authorities',
  departments: 'departments',
  actors: 'actors',
  payments: 'payments',
  partners: 'payments',
  profile: 'store',
  store: 'store',
};

function sectionLabels(): Array<{ id: OrgSection; label: string }> {
  return [
    { id: 'team', label: 'Team' },
    { id: 'roles', label: 'Roles' },
    { id: 'authorities', label: 'Approval authorities' },
    { id: 'actors', label: 'Who does what' },
    { id: 'payments', label: 'Payments' },
    { id: 'departments', label: 'Departments' },
    { id: 'handoffs', label: 'What happens next' },
    { id: 'records', label: 'Record settings' },
    { id: 'alerts', label: 'WhatsApp alerts' },
    { id: 'brand', label: 'Brand and documents' },
    { id: 'store', label: 'Public profile' },
  ];
}

type OrgQuestion = 1 | 2 | 3 | 4 | 5;
const ORG_QUESTION_COUNT = 5;
const QUESTION_FOR_STEP: Partial<Record<SetupStepId, OrgQuestion>> = { kinds: 1, people: 2, money: 4, payments: 5 };
const STEP_SAVED_LABEL: Record<OrgQuestion, string> = { 1: 'What you do', 2: 'Staff leave and payroll', 3: 'Teams', 4: 'Who handles money', 5: 'Payments' };
const OPEN_FOR_KIND: Record<OrgKind, string> = { office: '', field: 'Jobs', school: 'School fees', shop: 'Counter sales' };

/** Which card on this page fixes a checklist item. */
function readinessFixTarget(item: ReadinessItem): ReadinessFixTarget | null {
  const key = String(item.key || '').toLowerCase();
  if (/stage_actor|actor/.test(key)) return 'actors';
  if (/department/.test(key)) return 'departments';
  if (/authorit/.test(key)) return 'authorities';
  if (/^roles?$/.test(key)) return 'roles';
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
  roles: 'org-card-roles',
  authorities: 'org-card-authorities',
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
  const [savingRails, setSavingRails] = useState(false);
  const [storePaymentRails, setStorePaymentRails] = useState<string[]>([]);

  // Member management
  const [memberList, setMemberList] = useState<Array<{ userId: string; role: string; walletTenantId?: string; status: string; displayName?: string; phone?: string; invitePending?: boolean }>>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteWhatsApp, setInviteWhatsApp] = useState(true);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string | null>('field_worker');
  const [teamRoleChoices, setTeamRoleChoices] = useState(TEAM_ROLE_FALLBACK);
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  /** Organisation setting: what happens to an earlier staff card when a role changes. */
  const [staffCardChange, setStaffCardChange] = useState<StaffCardChangeRule>(DEFAULT_STAFF_CARD_CHANGE);
  const [savingStaffCardChange, setSavingStaffCardChange] = useState(false);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [deptName, setDeptName] = useState('');
  const [deptBusy, setDeptBusy] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);

  // What each person still has to do: sign in, identity card, staff card, role cards.
  const [onboardingRows, setOnboardingRows] = useState<MemberOnboarding[]>([]);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [sendingCards, setSendingCards] = useState<string | null>(null);

  const fetchOnboarding = useCallback(async (orgId: string) => {
    const token = getPreferredToken();
    if (!token || !orgId) return;
    try {
      const res = await api.get(`/api/organizations/${orgId}${ONBOARDING_PATH}`, { headers: { Authorization: `Bearer ${token}` } });
      setOnboardingRows(safeArray(res.data));
    } catch { setOnboardingRows([]); }
  }, []);

  const loadTeamRoles = useCallback(async (orgId: string) => {
    const token = getPreferredToken();
    if (!token || !orgId) return;
    try {
      const res = await api.get(`/api/organizations/${orgId}/roles`, { headers: { Authorization: `Bearer ${token}` } });
      const fromSetup = teamRolesFromCatalog(safeArray(res.data));
      const next = fromSetup.length > 0 ? fromSetup : TEAM_ROLE_FALLBACK;
      setTeamRoleChoices(next);
      setInviteRole((current) => (next.some((choice) => choice.value === current) ? current : next[0]?.value || 'member'));
    } catch {
      setTeamRoleChoices(TEAM_ROLE_FALLBACK);
    }
  }, []);

  const fetchMembers = useCallback(async (orgId: string) => {
    const token = getPreferredToken();
    if (!token || !orgId) return;
    setMembersLoading(true);
    try {
      const res = await api.get(`/api/organizations/${orgId}/members`, { headers: { Authorization: `Bearer ${token}` } });
      setMemberList(safeArray(res.data?.members ?? res.data));
    } catch { setMemberList([]); } finally { setMembersLoading(false); }
    void fetchOnboarding(orgId);
  }, [fetchOnboarding]);

  const sendMemberCards = async (userId: string, kind: MemberCardKind | 'all') => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    setSendingCards(`${userId}:${kind}`);
    try {
      const res = await api.post(`/api/organizations/${activeId}${sendCardsPath(userId)}`, { kind }, { headers: { Authorization: `Bearer ${token}` } });
      const sent: string[] = res.data?.sent || [];
      const skipped: Array<{ reason: string }> = res.data?.skipped || [];
      if (res.data?.member) setOnboardingRows((prev) => prev.map((row) => (row.userId === userId ? res.data.member : row)));
      notifications.show({
        title: sent.length > 0 ? 'Sent' : 'Nothing new to send',
        message: sent.length > 0 ? 'They will find it in their app inbox.' : skipped[0]?.reason || 'Everything they need is already in their app.',
        color: sent.length > 0 ? 'green' : 'gray',
      });
    } catch (err: any) {
      feedback.error(err.response?.data?.message ?? err.message, { title: 'Could not send' });
    } finally { setSendingCards(null); }
  };

  const myUserId = useMemo(() => {
    const token = getPreferredToken();
    const payload = token ? decodeJwtPayload(token) : null;
    return payload?.id ? String(payload.id) : null;
  }, [activeId]);

  const showInviteResult = (data: any, who?: string) => {
    if (data?.invite?.channel === 'link' && data.invite.link) {
      void navigator.clipboard?.writeText(data.invite.link).catch(() => undefined);
      notifications.show({ title: 'Give them this link', message: `${data.message} Copied: ${data.invite.link}`, color: 'orange', autoClose: false });
      return;
    }
    notifications.show({ title: who ? `${who} invited` : 'Invite sent', message: data?.message || 'They are on the team.', color: data?.invite?.channel === 'none' ? 'orange' : 'green' });
  };

  const resendInvite = async (userId: string) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    setResendingInvite(userId);
    try {
      const res = await api.post(`/api/organizations/${activeId}/members/${userId}/resend-invite`, {}, { headers: { Authorization: 'Bearer ' + token } });
      showInviteResult(res.data);
      void fetchMembers(activeId);
    } catch (err: any) {
      feedback.error(err.response?.data?.message ?? err.message, { title: 'Could not resend' });
    } finally {
      setResendingInvite(null);
    }
  };

  const handleInviteMember = async () => {
    const token = getPreferredToken();
    if (!token || !activeId || !invitePhone.trim() || inviteName.trim().length < 2) return;
    setInviting(true);
    try {
      const res = await api.post(`/api/organizations/${activeId}/members/invite`, { phone: invitePhone.trim(), name: inviteName.trim(), role: inviteRole || 'member', whatsappConsent: inviteWhatsApp }, { headers: { Authorization: `Bearer ${token}` } });
      showInviteResult(res.data, inviteName.trim());
      setInvitePhone(''); setInviteName(''); setShowInvite(false);
      void fetchMembers(activeId);
    } catch (err: any) {
      feedback.error(err.response?.data?.message ?? err.message, { title: 'Invite failed' });
    } finally { setInviting(false); }
  };

  const handleRemoveMember = async (userId: string) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    const who = memberList.find((m) => m.userId === userId);
    if (!window.confirm(`Remove ${personName(who, userId)} from the organization?`)) return;
    try {
      await api.delete(`/api/organizations/${activeId}/members/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
      feedback.info(personName(who, userId), { title: 'Removed' });
      void fetchMembers(activeId);
    } catch (err: any) {
      feedback.error(err.response?.data?.message ?? err.message, { title: 'Remove failed' });
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
  const [orgModules, setOrgModules] = useState<OrgModule[]>([]);
  const [operatingModel, setOperatingModel] = useState<OrgOperatingModel>('internal');
  const [orgQuestion, setOrgQuestion] = useState<0 | OrgQuestion>(0);
  const [orgQuestionPreset, setOrgQuestionPreset] = useState('keep_current');
  const [orgQuestionPay, setOrgQuestionPay] = useState<PaymentChoice>('simulated');
  /** The owner's own team pick; until they touch it, suggestions follow the other answers. */
  const [pickedTeams, setPickedTeams] = useState<string[] | null>(null);
  const [newTeam, setNewTeam] = useState('');
  /** Preview of everything the answers will set up, shown before saving. */
  const [orgReview, setOrgReview] = useState<OrgSetupPlan | null>(null);
  useEffect(() => {
    if (orgQuestion !== ORG_QUESTION_COUNT) setOrgReview(null);
  }, [orgQuestion]);
  /** Answers saved on the server; null until the owner finishes the questions on any device. */
  const [serverProfile, setServerProfile] = useState<OrgProfile | null>(null);
  /** The settings area open on its own screen; null shows the organisation home. */
  const [section, setSection] = useState<OrgSection | null>(null);
  useEffect(() => {
    const wanted = typeof router.query.section === 'string' ? router.query.section : '';
    if (wanted && sectionLabels().some((item) => item.id === wanted)) setSection(wanted as OrgSection);
  }, [router.query.section]);
  /** True when one question was opened from the checklist, not the first-run flow. */
  const [orgSingle, setOrgSingle] = useState(false);
  /** Checklist questions still to do after this one. */
  const [orgThen, setOrgThen] = useState<OrgQuestion[]>([]);
  /** Small "done" screen after saving: which question, or 'all' after the first run. */
  const [orgDone, setOrgDone] = useState<null | OrgQuestion | 'all'>(null);
  const [brandConfigured, setBrandConfigured] = useState<boolean | undefined>(undefined);
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
  const myOnboarding = useMemo(
    () => onboardingRows.find((row) => row.userId === myUserId) || (onboardingRows.length === 1 && !canManageOrgSetup ? onboardingRows[0] : null),
    [onboardingRows, myUserId, canManageOrgSetup],
  );

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
      feedback.success(chosen ? `${chosen.name} is how this organization takes and releases money.` : 'Saved.', { title: 'Payment method saved' });
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not save the payment method' });
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
      feedback.success('Documents you issue here will be accepted.', { title: 'This organization is trusted' });
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not update' });
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
      feedback.success('Documents from this partner can now be accepted.', { title: 'Partner added' });
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not add partner' });
    } finally {
      setSetupBusy(false);
    }
  };

  useEffect(() => {
    if (!activeId) return;
    void loadStoreBasics(activeId);
    void loadWorkflowActorDefaults();
    void fetchMembers(activeId);
    void loadTeamRoles(activeId);
    void loadDepartments(activeId);
    void loadActiveWorkflowTypes(activeId);
    void loadReadiness(activeId);
    void loadOrgSetupExtras(activeId);
  }, [activeId, fetchMembers, loadTeamRoles, loadActiveWorkflowTypes, loadReadiness, loadOrgSetupExtras]);

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
      const token = getPreferredToken();
      // Owner preview works while the organisation is still private; the public storefront 404s then.
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgId)}/offerings/preview`, {
        headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      }).catch(() => api.get(`/api/discovery/organizations/${encodeURIComponent(orgId)}/storefront`));
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

      feedback.success(`${humanizeKey(stageAction)} · ${humanizeKey(workflowType)}`, { title: selected ? 'Person saved for this step' : 'Person cleared for this step' });
      await loadWorkflowActorDefaults();
    } catch (err: any) {
      feedback.fromError(err, { title: 'Save failed', fallback: 'Could not save actor default.' });
    } finally {
      setSavingActorAction(null);
    }
  };

  /** Other people who may also decide a step that already has someone chosen. */
  const saveCoActors = async (
    workflowType: string,
    stageAction: string,
    current: WorkflowActorDefault,
    userIds: string[],
    renewAccess = false,
  ) => {
    const token = getPreferredToken();
    if (!token || !activeId) return;
    const key = `${workflowType}:${stageAction}`;
    setSavingActorAction(key);
    try {
      await api.put(`/api/organizations/${encodeURIComponent(activeId)}/workflows/actors/defaults`, {
        workflowType,
        stageAction,
        defaultUserId: current.defaultUserId,
        defaultRole: current.defaultRole,
        defaultWalletTenantId: current.defaultWalletTenantId,
        additionalUserIds: userIds,
        ...(renewAccess ? { renewAccess: true } : {}),
      }, { headers: { Authorization: 'Bearer ' + token } });
      feedback.success(`${humanizeKey(stageAction)} · ${humanizeKey(workflowType)}`, { title: renewAccess ? 'Approval access renewed' : userIds.length ? 'People saved for this step' : 'Extra people removed' });
      await loadWorkflowActorDefaults();
    } catch (err: any) {
      feedback.fromError(err, { title: 'Save failed', fallback: 'Could not save the people for this step.' });
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
      feedback.fromError(err, { title: 'Policy update failed', fallback: 'Could not update fallback policy.' });
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
      feedback.success(deptName.trim(), { title: 'Department added' });
      await loadDepartments(activeId);
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not add department' });
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
      feedback.success('Purchase-request steps now follow this setup.', { title: 'Setup applied' });
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not apply setup' });
    } finally {
      setApplyingPreset(null);
    }
  };

  const saveStaffCardChange = async (value: string) => {
    const token = getPreferredToken() || getWalletToken();
    const rule = staffCardChangeRule(value);
    if (!token || !activeId) return;
    const previous = staffCardChange;
    setStaffCardChange(rule);
    setSavingStaffCardChange(true);
    try {
      await api.put(`/api/organizations/${encodeURIComponent(activeId)}${SETUP_PROFILE_PATH}`, { staffCardChange: rule }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      feedback.success('Applies the next time a role changes.', { title: 'Saved' });
    } catch (err: any) {
      setStaffCardChange(previous);
      feedback.fromError(err, { title: 'Could not save' });
    } finally {
      setSavingStaffCardChange(false);
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
      feedback.success(`${ROLE_LABELS[role] || humanizeKey(role)}. A new staff card is on its way to their app inbox.${['owner', 'admin'].includes(String(role).toLowerCase()) ? ' Once they accept it, they can open the organisation and its dashboard.' : ' Their jobs and approvals come to their personal inbox.'}`, { title: 'Role updated' });
      await fetchMembers(activeId);
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not change role' });
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
      feedback.success(offered > 0 ? `${offered} role card${offered === 1 ? '' : 's'} sent to team members' wallets.` : `${covered} ${covered === 1 ? 'person' : 'people'} already have theirs.`, { title: 'Role cards' });
      await loadWorkflowActorDefaults();
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not offer credentials', fallback: 'Offer failed.' });
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

  useEffect(() => {
    if (!activeId) return;
    let live = true;
    setBrandConfigured(undefined);
    api
      .get(`/api/public/orgs/${encodeURIComponent(activeId)}/brand`)
      .then((res) => { if (live) setBrandConfigured(Boolean(res.data?.configured)); })
      .catch(() => { if (live) setBrandConfigured(false); });
    return () => { live = false; };
  }, [activeId]);

  const setupSteps = useMemo(
    () => setupChecklist({
      profile: serverProfile || readOrgProfile(),
      items: readiness?.items ?? [],
      memberCount: memberList.length,
      roles: memberList.map((member) => member.role),
      brandConfigured,
    }),
    [serverProfile, readiness, memberList, brandConfigured],
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
        feedback.success('Store payment rails updated.', { title: 'Ways to pay saved' });
        await loadStoreBasics(activeId);
      }
    } catch (err: any) {
      feedback.fromError(err, { title: 'Save failed', fallback: 'Could not update payment rails.' });
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
      feedback.success(orgLabel, { title: 'Organisation switched' });
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

      feedback.success(newOrgName.trim(), { title: 'Organisation created' });
      setActiveId(orgTenantId);
      setActiveLabel(newOrgName.trim());
      void loadActiveWorkflowTypes(orgTenantId);
      void loadReadiness(orgTenantId);
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
    if (serverProfile) setOrgModules(serverProfile.modules);
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
        setStaffCardChange(staffCardChangeRule(res.data?.staffCardChange));
        const server = profileFromServer(res.data);
        setServerProfile(server);
        if (server) {
          setOperatingModel(server.operatingModel || 'internal');
          persistOrgProfile(server);
          if (server.completedAt) setOrgQuestion(0);
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
    // A cached profile alone does not mean answered: the server returns one for new organisations too.
    if (readOrgProfile()?.completedAt || orgSetupLater(activeId)) {
      setOrgQuestion(0);
      return;
    }
    setOrgQuestion((current) => (current === 0 ? 1 : current));
  }, [canManageOrgSetup, activeId]);

  const existingTeams = cleanDepartmentNames(departments.map((dept) => dept.name));
  const suggestedTeams = suggestedDepartmentsFor({
    kinds: orgKinds,
    modules: orgModules,
    approvalPresetId: orgQuestionPreset === 'keep_current' ? serverProfile?.approvalPresetId : orgQuestionPreset,
  });
  const selectedTeams = pickedTeams ?? cleanDepartmentNames([...existingTeams, ...suggestedTeams]);
  const teamOptions = cleanDepartmentNames([...existingTeams, ...suggestedTeams, ...selectedTeams]);
  const addTeam = () => {
    const name = newTeam.trim();
    if (!name) return;
    setPickedTeams(cleanDepartmentNames([...selectedTeams, name]));
    setNewTeam('');
  };

  const currentOrgProfile = (): OrgProfile => ({
    orgTenantId: activeId || undefined,
    operatingModel,
    access: serverProfile?.access,
    kinds: orgKinds,
    modules: orgModules,
    approvalPresetId: orgQuestionPreset === 'keep_current' ? serverProfile?.approvalPresetId || '' : orgQuestionPreset,
    approvalTitle:
      orgQuestionPreset === 'keep_current'
        ? serverProfile?.approvalTitle || 'People chosen under Who does what'
        : (actorsView?.presets || []).find((preset) => preset.id === orgQuestionPreset)?.title || '',
    paymentChoice: orgQuestionPay,
    completedAt: new Date().toISOString(),
    plan: serverProfile?.plan,
  });

  /** Answers, teams, roles, money people and payments in one call (a preview when `dryRun`). */
  const sendOrgBootstrap = async (body: Record<string, unknown>): Promise<(OrgSetupPlan & { profile?: unknown }) | null> => {
    if (!activeId) return null;
    setActivating(true);
    try {
      const token = await orgSetupToken();
      const res = await api.post(`/api/organizations/${activeId}${SETUP_BOOTSTRAP_PATH}`, body, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!body.dryRun) {
        if (res.data?.profile) {
          const server = profileFromServer(res.data.profile);
          setServerProfile(server);
          if (server) persistOrgProfile(server);
        }
        setPickedTeams(null);
        await Promise.all([loadDepartments(activeId), loadActiveWorkflowTypes(activeId), loadReadiness(activeId)]);
      }
      return res.data;
    } catch (err: any) {
      feedback.error(err.response?.data?.message ?? err.message ?? 'Please try again.', { title: body.dryRun ? 'Could not prepare your setup' : 'Could not save' });
      return null;
    } finally {
      setActivating(false);
    }
  };

  const fullBootstrapBody = (dryRun: boolean) =>
    bootstrapRequest(currentOrgProfile(), { departments: selectedTeams, moneyPresetId: orgQuestionPreset || 'keep_current', dryRun });

  const reviewOrgQuestions = async () => {
    const plan = await sendOrgBootstrap(fullBootstrapBody(true));
    if (plan) setOrgReview(plan);
  };

  const finishOrgQuestions = async () => {
    const result = await sendOrgBootstrap(fullBootstrapBody(false));
    if (!result) return;
    setOrgReview(null);
    setOrgQuestion(0);
    setOrgDone('all');
  };

  /** Save the one question opened from the checklist, then show a small done screen. */
  const saveSingleQuestion = async () => {
    const question = orgQuestion;
    if (question === 0) return;
    let saved = false;
    if (question === 1) {
      saved = await saveOrgKinds(undefined, { kinds: orgKinds, operatingModel, modules: orgModules });
    } else if (question === 2) {
      saved = await saveOrgKinds(undefined, { modules: orgModules });
    } else if (question === 3) {
      saved = Boolean(await sendOrgBootstrap({ departments: selectedTeams }));
    } else if (question === 4) {
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
    if (id === 'team' || id === 'brand') {
      setSection(id);
      return;
    }
    const question = QUESTION_FOR_STEP[id];
    if (!question) return;
    setOrgSingle(true);
    setOrgThen(rest.map((step) => QUESTION_FOR_STEP[step]).filter((value): value is OrgQuestion => Boolean(value)));
    setOrgQuestion(question);
  };

  /** The org-scoped token, switching into the organisation first when only a wallet session exists. */
  const orgSetupToken = async (): Promise<string> => {
    let token = getPreferredToken();
    if (!token) {
      const walletToken = getWalletToken();
      if (walletToken) {
        const switchRes = await api.post(
          `/api/organizations/${activeId}/switch`,
          {},
          { headers: { Authorization: 'Bearer ' + walletToken } }
        );
        const { token: orgToken, sector, orgName, workflowTypes, orgRole } = switchRes.data || {};
        if (orgToken) {
          applyOrgContext({
            orgId: activeId as string,
            orgName: orgName || activeLabel || 'Organization',
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
    return token;
  };

  /** Save the answers. The server works out which kinds of request follow; nothing is named or switched on. */
  const saveOrgKinds = async (profile?: OrgProfile, partial?: Record<string, unknown>): Promise<boolean> => {
    if (!activeId) {
      feedback.error('Switch to an organization first.', { title: 'No organization' });
      return false;
    }

    setActivating(true);
    try {
      const token = await orgSetupToken();

      const body = { ...(partial ?? (profile ? profileToServer(profile) : { kinds: orgKinds })),
        expectedRevision: serverProfile?.access?.revision ?? 0 };
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
      feedback.error(err.response?.data?.message ?? err.message ?? 'Please try again.', { title: 'Could not save' });
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
    const extraCount = stage.default?.enabled ? (stage.default.additionalUserIds?.length ?? 0) : 0;
    const onlyHere = stage.moneyStep && !isPurchaseRequests(workflow) && stage.default?.enabled;
    return (
      <Box key={key}>
        <Text size="sm" fw={500}>
          {shortStepTitle(stage.stageAction, stage.title)}
          {onlyHere ? ` · only for ${plainRequestName(workflow).toLowerCase()}` : ''}
        </Text>
        <Text size="xs" c="dimmed">
          {person}
          {extraCount ? ` + ${extraCount} more` : ''}
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
        {stage.default?.enabled && !stage.askedOnFirstUse && (
          <MultiSelect
            mt={4}
            size="xs"
            placeholder={stage.default.additionalUserIds?.length ? '' : 'Also allowed to act (optional)'}
            description="Any one of these people can also do this step."
            data={actorsView.members
              .filter((member) => member.userId !== stage.default?.defaultUserId)
              .map((member) => ({
                value: member.userId,
                label: `${personName(member)}${member.walletTenantId ? '' : ' (no wallet)'}`,
                disabled: !member.walletTenantId,
              }))}
            value={stage.default.additionalUserIds ?? []}
            clearable
            searchable
            onChange={(next) => stage.default && saveCoActors(workflow.workflowType, stage.stageAction, stage.default, next)}
            disabled={!actorsView.canEdit || savingActorAction === key}
          />
        )}
        {stage.default?.enabled && stage.access?.some((entry) => entry.via !== 'role' && entry.via !== 'grant') && (
          <Box mt={4}>
            {stage.access
              .filter((entry) => entry.via !== 'role' && entry.via !== 'grant')
              .map((entry) => (
                <Text key={entry.userId} size="xs" c={entry.via === 'delegation' ? 'dimmed' : 'orange'}>
                  {personName(actorsView.members.find((m) => m.userId === entry.userId), entry.userId)}
                  {entry.via === 'delegation'
                    ? ` can approve until ${formatAccessDate(entry.validUntil)}`
                    : entry.via === 'expired'
                      ? ` · approval access ended ${formatAccessDate(entry.validUntil)}`
                      : ' · cannot approve yet'}
                </Text>
              ))}
            {actorsView.canEdit && (
              <Button
                mt={2}
                size="compact-xs"
                variant="subtle"
                loading={savingActorAction === key}
                onClick={() =>
                  stage.default &&
                  saveCoActors(workflow.workflowType, stage.stageAction, stage.default, stage.default.additionalUserIds ?? [], true)
                }
              >
                Renew approval access (30 days)
              </Button>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const answering = section === null && (orgQuestion > 0 || orgDone !== null);

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb={80}>
        {/* ── Header ── */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title order={3}>{section ? sectionLabels().find(item => item.id === section)?.label : 'Organisation settings'}</Title>
          <StepHelp
            title="Setup"
            points={[
              'These answers decide which work this organisation runs.',
              'Jobs, purchases and school fees follow from what you do.',
              'Who handles money is asked here. Other steps are asked the first time they are used.',
              'You can change an answer later.',
            ]}
          />
        </Group>

        <SectionTip tip="tip_org_settings" when={canManageOrgSetup && Boolean(activeId) && section === null} />
        <Divider />
        {error && <ErrorAlert message={error} />}
        {activeId && serverProfile?.access?.drainingWork?.length ? (
          <Alert color="blue" title="Existing work is continuing">
            {serverProfile.access.drainingWork.map((item) => {
              const parts = [
                item.activeRequests ? `${item.activeRequests} request${item.activeRequests === 1 ? '' : 's'}` : '',
                item.activeWorkflowRuns ? `${item.activeWorkflowRuns} workflow run${item.activeWorkflowRuns === 1 ? '' : 's'}` : '',
              ].filter(Boolean)
              return `${item.label}: ${parts.join(' and ')}`
            }).join('. ')}. New work in these areas is unavailable; existing work and its history are retained.
          </Alert>
        ) : null}

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
                <Stack key={`done-${orgDone}`} className={reveal.stagger} gap="sm" align="center">
                  {orgDone === 'all'
                    ? <LottiePlayer kind="org_setup" size={120} />
                    : <ThemeIcon color="teal" variant="light" radius="xl" size={44}><IconCheck size={22} /></ThemeIcon>}
                  <Text fw={700} ta="center">
                    {orgDone === 'all' ? `${activeLabel || 'Your organisation'} is set up` : `${STEP_SAVED_LABEL[orgDone]} saved`}
                  </Text>
                  {orgDone === 'all' && (
                    <Text size="xs" c="dimmed" ta="center">
                      What you can do now: {['Purchase requests', 'Supplier bills', ...orgKinds.map((kind) => OPEN_FOR_KIND[kind]).filter(Boolean), ...orgModules.map((module) => ORG_MODULE_OPTIONS.find((option) => option.id === module)?.opens || '').filter(Boolean)].join(', ')}.
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
                    <>
                      {!brandConfigured && (
                        <Button size="sm" fullWidth rightSection={<IconArrowRight size={14} />} onClick={() => { setOrgDone(null); setSection('brand'); }}>
                          Next: add your logo and document details
                        </Button>
                      )}
                      <Button size="sm" fullWidth variant={brandConfigured ? 'filled' : 'light'} rightSection={<IconArrowRight size={14} />} onClick={() => { setOrgDone(null); setSection('team'); }}>
                        Invite your team
                      </Button>
                    </>
                  ) : null}
                  <Button size="xs" variant="subtle" onClick={() => { setOrgDone(null); setOrgThen([]); }}>
                    {orgThen.length > 0 && orgDone !== 'all' ? 'Finish later' : 'Back to setup'}
                  </Button>
                </Stack>
              </Paper>
            )}
            {section === null && canManageOrgSetup && orgQuestion > 0 && orgReview && (
              <Paper p="md" radius="md" withBorder>
                <Stack key="review" className={reveal.stagger} gap="sm">
                  <Text fw={700}>Here is what we will set up</Text>
                  <Text size="xs" c="dimmed">Nothing is saved until you confirm. You can change any of this later.</Text>
                  <Stack gap={2}>
                    <Text size="xs" fw={600}>Work areas</Text>
                    <Text size="sm">
                      {orgReview.workAreas.length > 0
                        ? orgReview.workAreas.map((area) => area.label).join(', ')
                        : operatingModel === 'integration'
                          ? 'None here. Connect your own systems after setup.'
                          : 'Purchase requests and supplier bills. Add more any time.'}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" fw={600}>Teams</Text>
                    <Text size="sm">
                      {orgReview.departments.map((item) => (item.status === 'existing' ? item.name : `${item.name} (${item.status})`)).join(', ')}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" fw={600}>Roles</Text>
                    <Text size="sm">{orgReview.roles.map((role) => (role.status === 'new' ? `${role.name} (new)` : role.name)).join(', ')}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" fw={600}>Money</Text>
                    {orgReview.money.keepCurrent ? (
                      <Text size="sm">Keeps the people already chosen under Who does what.</Text>
                    ) : (
                      <>
                        <Text size="sm">Approves: {orgReview.money.approves}</Text>
                        {orgReview.money.financeConfirms && <Text size="sm">Finance confirms: {orgReview.money.financeConfirms}</Text>}
                        <Text size="sm">Releases the money: {orgReview.money.releases}</Text>
                      </>
                    )}
                    <Text size="sm">Payments: {orgReview.payment.name || 'Not yet'}</Text>
                  </Stack>
                  <Alert color="teal" variant="light" radius="md" p="xs">
                    <Text size="xs">
                      {orgReview.askedOnFirstUse.join(' ')} If nobody is chosen for a step, the usual role order is used, then the owner stands in.
                    </Text>
                  </Alert>
                  <Group justify="space-between">
                    <Button size="xs" variant="subtle" color="gray" onClick={() => setOrgReview(null)} disabled={activating}>
                      Back
                    </Button>
                    <Button size="xs" loading={activating || setupBusy} onClick={() => void finishOrgQuestions()}>
                      Set it up
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
            {section === null && canManageOrgSetup && orgQuestion > 0 && !orgReview && (
              <Paper p="md" radius="md" withBorder>
                <Stack key={`question-${orgQuestion}`} className={reveal.stagger} gap="sm">
                  <GuidedSteps current={orgQuestion} total={ORG_QUESTION_COUNT} label="Question" />
                  <Text fw={700}>
                    {orgQuestion === 1
                      ? `What does ${activeLabel || 'your organisation'} do?`
                      : orgQuestion === 2
                        ? 'Which of these would be useful for your organisation?'
                        : orgQuestion === 3
                          ? 'Which teams do you have?'
                          : orgQuestion === 4
                            ? 'Who approves and releases money?'
                            : 'How do you take payments?'}
                  </Text>
                  {orgQuestion === 1 && (
                    <Stack>
                    <Radio.Group label="How will you use the platform?" value={operatingModel} onChange={(value) => {
                      const model = value as OrgOperatingModel;
                      setOperatingModel(model);
                      if (model === 'integration') setOrgModules([]);
                    }}>
                      <Stack gap="xs">
                        <Radio value="internal" label="Handle our work here" />
                        <Radio value="integration" label="Connect an existing business system" />
                        <Radio value="hybrid" label="Both" />
                      </Stack>
                    </Radio.Group>
                    <Text size="xs">Identity, wallets and required proofs are always retained.</Text>
                    {operatingModel !== 'integration' && <Chip.Group multiple value={orgKinds} onChange={(value) => {
                      const answers = value as OrgKind[];
                      setOrgKinds(answers);
                      setOrgModules(suggestedOrgModules(answers, operatingModel));
                    }}>
                      <Stack gap={6}>
                        {ORG_KIND_OPTIONS.map((option) => (
                          <Box key={option.id}>
                            <Chip value={option.id} radius="md" variant="outline">
                              {option.label}
                            </Chip>
                            <Text size="xs" c="dimmed" mt={2}>{option.detail}</Text>
                          </Box>
                        ))}
                      </Stack>
                    </Chip.Group>}
                    </Stack>
                  )}
                  {orgQuestion === 2 && (
                    <Chip.Group multiple value={orgModules} onChange={(value) => setOrgModules(value as OrgModule[])}>
                      <Stack gap={6}>
                        {ORG_MODULE_OPTIONS.filter((option) => suggestedOrgModules(orgKinds, operatingModel).includes(option.id) || (operatingModel !== 'integration' && option.id === 'people_payroll')).map((option) => (
                          <Box key={option.id}>
                            <Chip value={option.id} radius="md" variant="outline">
                              {option.label}
                            </Chip>
                            <Text size="xs" c="dimmed" mt={2}>{option.detail}</Text>
                            <Text size="xs" c="dimmed">{modulePlanNote(option.id, serverProfile?.plan)}</Text>
                          </Box>
                        ))}
                        <Text size="xs" c="dimmed">{operatingModel === 'integration' ? 'No internal work areas needed. SSI remains available; external-client APIs are a later delivery.' : 'Suggested from your activity answers. Untick anything handled elsewhere; staff tools are optional.'}</Text>
                      </Stack>
                    </Chip.Group>
                  )}
                  {orgQuestion === 3 && (
                    <Stack gap={6}>
                      <Text size="xs" c="dimmed">
                        Teams sort requests and people. Nothing waits on them: anything without a team goes to General.
                      </Text>
                      <Chip.Group multiple value={selectedTeams} onChange={(value) => setPickedTeams(value as string[])}>
                        <Group gap={6}>
                          {teamOptions.map((name) => (
                            <Chip key={name} value={name} size="xs" radius="md" variant="outline">
                              {name}
                              {existingTeams.some((team) => team.toLowerCase() === name.toLowerCase()) ? '' : ' (new)'}
                            </Chip>
                          ))}
                        </Group>
                      </Chip.Group>
                      <Group gap={6} align="flex-end" wrap="nowrap">
                        <TextInput
                          size="xs"
                          style={{ flex: 1 }}
                          label="Add a team"
                          placeholder="e.g. Workshop"
                          maxLength={60}
                          value={newTeam}
                          onChange={(event) => setNewTeam(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              addTeam();
                            }
                          }}
                        />
                        <Button size="xs" variant="light" onClick={addTeam} disabled={!newTeam.trim()}>
                          Add
                        </Button>
                      </Group>
                      <Text size="xs" c="dimmed">Existing teams you untick are kept. Archive them later under Departments.</Text>
                    </Stack>
                  )}
                  {orgQuestion === 4 && (
                    <Stack gap={6}>
                      <Paper
                        withBorder
                        radius="md"
                        p="sm"
                        onClick={() => setOrgQuestionPreset('keep_current')}
                        style={{ cursor: 'pointer', borderColor: orgQuestionPreset === 'keep_current' ? 'var(--mantine-color-teal-6)' : undefined }}
                      >
                        <Group wrap="nowrap" align="flex-start" gap="sm">
                          <Stack gap={2} style={{ flex: 1 }}>
                            <Text size="sm" fw={600}>Keep what is set now</Text>
                            <Text size="xs" c="dimmed">Leave the people already chosen under Who does what.</Text>
                          </Stack>
                          {orgQuestionPreset === 'keep_current' && (
                            <ThemeIcon color="teal" variant="light" radius="xl" size="sm"><IconCheck size={12} /></ThemeIcon>
                          )}
                        </Group>
                      </Paper>
                      {(actorsView?.presets?.length ? actorsView.presets : MONEY_CHOICES).map((preset) => {
                        const choice = MONEY_CHOICES.find((item) => item.id === preset.id);
                        const selected = orgQuestionPreset === preset.id;
                        return (
                          <Paper
                            key={preset.id}
                            withBorder
                            radius="md"
                            p="sm"
                            onClick={() => setOrgQuestionPreset(preset.id)}
                            style={{ cursor: 'pointer', borderColor: selected ? 'var(--mantine-color-teal-6)' : undefined }}
                          >
                            <Group wrap="nowrap" align="flex-start" gap="sm">
                              <Stack gap={2} style={{ flex: 1 }}>
                                <Text size="sm" fw={600}>{choice?.title || preset.title}</Text>
                                <Text size="xs" c="dimmed">{choice?.detail || preset.detail}</Text>
                                {choice && (
                                  <>
                                    <Text size="xs">Confirms: {choice.confirms}</Text>
                                    <Text size="xs">Releases the money: {choice.releases}</Text>
                                  </>
                                )}
                              </Stack>
                              {selected && (
                                <ThemeIcon color="teal" variant="light" radius="xl" size="sm"><IconCheck size={12} /></ThemeIcon>
                              )}
                            </Group>
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
                  {orgQuestion === 5 && (
                    <Stack gap={6}>
                      {PAYMENT_CHOICES.map((choice) => {
                        const selected = orgQuestionPay === choice.id;
                        return (
                          <Paper
                            key={choice.id}
                            withBorder
                            radius="md"
                            p="sm"
                            onClick={() => setOrgQuestionPay(choice.id)}
                            style={{ cursor: 'pointer', borderColor: selected ? 'var(--mantine-color-teal-6)' : undefined }}
                          >
                            <Group wrap="nowrap" align="flex-start" gap="sm">
                              <Stack gap={2} style={{ flex: 1 }}>
                                <Text size="sm" fw={600}>{choice.label}</Text>
                                <Text size="xs" c="dimmed">{choice.detail}</Text>
                              </Stack>
                              {selected && (
                                <ThemeIcon color="teal" variant="light" radius="xl" size="sm"><IconCheck size={12} /></ThemeIcon>
                              )}
                            </Group>
                          </Paper>
                        );
                      })}
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
                          persistOrgProfile({ kinds: orgKinds, modules: orgModules, approvalPresetId: '', approvalTitle: '', paymentChoice: 'none', completedAt: '' });
                          if (activeId) markOrgSetupLater(activeId);
                          setOrgQuestion(0);
                          return;
                        }
                        setOrgQuestion((current) => (current - 1) as OrgQuestion);
                      }}
                    >
                      {orgQuestion === 1 ? "I'll answer later" : 'Back'}
                    </Button>
                    {orgQuestion < ORG_QUESTION_COUNT ? (
                      <Button size="xs" disabled={orgQuestion === 1 && orgKinds.length === 0} onClick={() => setOrgQuestion((current) => (current + 1) as OrgQuestion)}>
                        Continue
                      </Button>
                    ) : (
                      <Button size="xs" loading={activating || setupBusy} onClick={() => void reviewOrgQuestions()}>
                        Review
                      </Button>
                    )}
                  </Group>
                  )}
                </Stack>
              </Paper>
            )}
            {section === null && orgQuestion === 0 && orgDone === null && myOnboarding && myOnboarding.summary !== 'ready' && (
            <Paper p="md" radius="md" withBorder>
              <Stack className={reveal.stagger} gap="xs">
                <Group justify="space-between" align="start">
                  <Text fw={700}>Your getting started</Text>
                  <Badge size="xs" variant="light" color={SUMMARY_COLOR[myOnboarding.summary]}>{MY_SUMMARY_LABEL[myOnboarding.summary]}</Badge>
                </Group>
                {myOnboardingSteps(myOnboarding).map((step) => (
                  <Group key={step.label} gap="xs" wrap="nowrap" align="start">
                    <ThemeIcon radius="xl" size="sm" color={step.done ? 'teal' : 'gray'} variant={step.done ? 'filled' : 'light'}>
                      {step.done ? <IconCheck size={12} /> : null}
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" fw={step.done ? 400 : 600} c={step.done ? 'dimmed' : undefined}>{step.label}</Text>
                      {!step.done && <Text size="xs" c="dimmed">{step.hint}</Text>}
                    </Box>
                  </Group>
                ))}
                {myOnboarding.cards.some((card) => card.state === 'waiting') && (
                  <Button size="xs" onClick={() => router.push('/inbox')} style={{ alignSelf: 'flex-start' }}>Open Inbox</Button>
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
                        <Stack className={reveal.stagger} gap={8}>
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
                                  <Box>
                                    <Text size="sm" fw={isNext ? 600 : 400} c={step.done ? 'dimmed' : undefined}>{step.label}</Text>
                                    {step.note && <Text size="xs" c="dimmed">{step.note}</Text>}
                                  </Box>
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
                  {sectionLabels().filter((item) => canManageOrgSetup || !['payments', 'departments', 'records', 'roles', 'authorities', 'store', 'brand'].includes(item.id)).map((item) => (
                    <UnstyledButton key={item.id} onClick={() => setSection(item.id)} py="sm" style={{ minHeight: 48 }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm">{item.label}</Text>
                      <IconArrowRight size={14} />
                    </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              </Paper>
            )}

            {section !== null && (
              <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => setSection(null)} style={{ alignSelf: 'flex-start' }}>
                All settings
              </Button>
            )}

            {(section === 'roles' || section === 'authorities') && canManageOrgSetup && activeId && (
              <OrgPermissionsSettings key={activeId} orgId={activeId} section={section} onChanged={async () => {
                await Promise.all([loadTeamRoles(activeId), fetchMembers(activeId), loadReadiness(activeId)]);
              }} />
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
                            <Group gap={6} wrap="nowrap">
                              <Text size="xs">
                                {index + 1}. {entry.type === 'role' ? humanizeKey(entry.value) : personName(actorsView.members.find((m) => m.userId === entry.value), entry.value)}
                              </Text>
                              <Badge size="xs" variant="outline" color={entry.type === 'user' ? 'teal' : 'indigo'}>
                                {entry.type === 'user' ? 'Person' : entry.type === 'role' ? 'Role' : 'Wallet'}
                              </Badge>
                            </Group>
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

            {section === 'records' && activeId && <RecordSettingsCard orgTenantId={activeId} canEdit={canManageOrgSetup} />}

            {section === 'records' && <DeviceTrustSettingsCard orgTenantId={activeId} canEdit={canManageOrgSetup} />}
            {section === 'alerts' && <WhatsAppAlertsCard orgTenantId={activeId} canEdit={canManageOrgSetup} />}
            {section === 'brand' && activeId && (canManageOrgSetup ? (
              <BrandEditor orgTenantId={activeId} getToken={orgSetupToken} onSaved={() => setBrandConfigured(true)} />
            ) : (
              <Alert color="gray" variant="light">Only owners and admins can change the brand.</Alert>
            ))}

            {/* ── Member Management ── */}
            {section === 'team' && (
            <Paper id="org-card-members" p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="start">
                  <Box>
                    <Group gap="xs"><IconUsers size={18} color="var(--mantine-color-indigo-6)" /><Text fw={700}>Team Members</Text></Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      {onboardingRows.length > 0
                        ? (() => { const c = readyCount(onboardingRows); return c.ready === c.total ? 'Everyone has what they need in the app.' : `${c.ready} of ${c.total} ready. Tap a person to see what is still missing.`; })()
                        : 'Invite, manage roles, and remove members from this organisation.'}
                    </Text>
                  </Box>
                  {canManageOrgSetup && (
                    <Button size="xs" leftSection={<IconUserPlus size={14} />} onClick={() => setShowInvite((s) => !s)}>Invite</Button>
                  )}
                </Group>

                <Collapse in={showInvite && canManageOrgSetup}>
                  <Paper p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <TextInput label="Their name" description="They confirm or correct it when they open their invite." placeholder="e.g. Rudo Moyo" value={inviteName} onChange={(e) => setInviteName(e.target.value)} size="xs" required />
                      <TextInput label="Phone number" description="They get a one-time link on this number to choose their own PIN." placeholder="+263..." value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} size="xs" required />
                      <Checkbox size="xs" checked={inviteWhatsApp} onChange={(e) => setInviteWhatsApp(e.currentTarget.checked)} label="They agreed to get the invite on WhatsApp" description="Otherwise we send a text message." />
                      <Select label="Role" description="These follow the answers from setup." size="xs" value={inviteRole} onChange={setInviteRole} data={teamRoleChoices} />
                      <Group justify="flex-end">
                        <Button size="xs" variant="subtle" onClick={() => setShowInvite(false)}>Cancel</Button>
                        <Button size="xs" loading={inviting} disabled={!invitePhone.trim() || inviteName.trim().length < 2} onClick={handleInviteMember}>Send Invite</Button>
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
                    {memberList.map((m) => {
                      const ob = onboardingRows.find((row) => row.userId === m.userId);
                      const open = expandedMember === m.userId;
                      return (
                      <Paper key={m.userId} p="xs" radius="sm" withBorder>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={6} wrap="nowrap" onClick={() => ob && setExpandedMember(open ? null : m.userId)} style={{ cursor: ob ? 'pointer' : undefined }}>
                              <Text size="xs" fw={600} truncate>{personName(m)}</Text>
                              {ob && (
                                <Badge size="xs" variant="light" color={SUMMARY_COLOR[ob.summary]}>
                                  {SUMMARY_LABEL[ob.summary]}
                                  {ob.summary !== 'ready' && ob.summary !== 'no_app' ? ` · ${ob.cards.filter((c) => c.state === 'accepted').length}/${ob.cards.length}` : ''}
                                </Badge>
                              )}
                            </Group>
                            {m.phone && personName(m) !== m.phone && <Text size="10px" c="dimmed">{m.phone}</Text>}
                            <Group gap={4} mt={2}>
                              {canManageOrgSetup && m.role !== 'owner' ? (
                                <Select
                                  size="xs"
                                  data={teamRoleChoices.some((choice) => choice.value === m.role) ? teamRoleChoices : [...teamRoleChoices, { value: m.role, label: ROLE_LABELS[m.role] || humanizeKey(m.role) }]}
                                  value={m.role}
                                  disabled={changingRole === m.userId}
                                  onChange={(value) => void changeMemberRole(m.userId, value)}
                                  allowDeselect={false}
                                  style={{ width: 150 }}
                                />
                              ) : (
                                <Badge size="xs" variant="light" color="indigo">{ROLE_LABELS[m.role] || humanizeKey(m.role)}</Badge>
                              )}
                              <Badge size="xs" variant="outline" color={memberAccessBadge(m.role).color}>{memberAccessBadge(m.role).label}</Badge>
                              {m.walletTenantId && !m.invitePending && <Badge size="xs" variant="dot" color="teal">App installed</Badge>}
                              {m.invitePending && <Badge size="xs" variant="light" color="orange">Invite not opened</Badge>}
                              {m.invitePending && canManageOrgSetup && (
                                <Button size="compact-xs" variant="subtle" loading={resendingInvite === m.userId} onClick={() => void resendInvite(m.userId)}>Resend invite</Button>
                              )}
                              <Badge size="xs" variant="light" color={m.status === 'active' ? 'green' : 'gray'}>{m.status === 'active' ? 'Active' : m.status === 'suspended' ? 'Suspended' : 'Invited'}</Badge>
                            </Group>
                          </Box>
                          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => handleRemoveMember(m.userId)}>
                            Remove
                          </Button>
                        </Group>
                        {ob && (
                          <Collapse in={open}>
                            <Stack gap={6} mt="xs">
                              <Text size="xs">{ob.nextStep}</Text>
                              <Group justify="space-between" wrap="nowrap">
                                <Group gap={6} wrap="nowrap">
                                  <ThemeIcon radius="xl" size="xs" color={ob.hasApp ? 'teal' : 'gray'} variant={ob.hasApp ? 'filled' : 'light'}>{ob.hasApp ? <IconCheck size={10} /> : null}</ThemeIcon>
                                  <Text size="xs">Signed in to the app</Text>
                                </Group>
                                <Badge size="xs" variant="light" color={ob.hasApp ? 'teal' : 'gray'}>{ob.hasApp ? 'Done' : 'Not yet'}</Badge>
                              </Group>
                              {ob.cards.map((card) => (
                                <Box key={`${card.kind}:${card.workflowType || ''}`}>
                                  <Group justify="space-between" wrap="nowrap" align="start">
                                    <Group gap={6} wrap="nowrap" align="start">
                                      <ThemeIcon radius="xl" size="xs" color={card.state === 'accepted' ? 'teal' : 'gray'} variant={card.state === 'accepted' ? 'filled' : 'light'}>{card.state === 'accepted' ? <IconCheck size={10} /> : null}</ThemeIcon>
                                      <Box>
                                        <Text size="xs">{card.label}</Text>
                                        <Text size="10px" c="dimmed">{cardPurpose(card)}</Text>
                                        {cardResendHint(card) && <Text size="10px" c="dimmed">{cardResendHint(card)}</Text>}
                                      </Box>
                                    </Group>
                                    <Stack gap={2} align="end">
                                      <Badge size="xs" variant="light" color={CARD_STATE_COLOR[card.state]}>{CARD_STATE_LABEL[card.state]}</Badge>
                                      {canManageOrgSetup && ob.hasApp && cardCanResend(card) && (
                                        <Button size="compact-xs" variant="subtle" loading={sendingCards === `${ob.userId}:${card.kind}`} onClick={() => void sendMemberCards(ob.userId, card.kind)}>
                                          {card.state === 'not_sent' ? 'Send' : 'Send again'}
                                        </Button>
                                      )}
                                    </Stack>
                                  </Group>
                                </Box>
                              ))}
                              {ob.hasApp && !(ob.cards.find((card) => card.kind === 'employee')?.covers?.length) && (
                                <Text size="10px" c="dimmed">Their staff card is enough for now. Who goes out and who checks the work is chosen on each job.</Text>
                              )}
                              {canManageOrgSetup && ob.hasApp && ob.summary !== 'ready' && (
                                <Button size="xs" loading={sendingCards === `${ob.userId}:all`} onClick={() => void sendMemberCards(ob.userId, 'all')} style={{ alignSelf: 'flex-start' }}>
                                  Send everything missing
                                </Button>
                              )}
                            </Stack>
                          </Collapse>
                        )}
                      </Paper>
                      );
                    })}
                  </Stack>
                )}

                {canManageOrgSetup && (
                  <Paper p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <Text size="sm" fw={600}>When a role changes</Text>
                      <Text size="xs" c="dimmed">
                        The person gets a new staff card in their app inbox. Choose what happens to the one they already hold.
                      </Text>
                      <Radio.Group value={staffCardChange} onChange={(value) => void saveStaffCardChange(value)}>
                        <Stack gap="xs">
                          {STAFF_CARD_CHANGE_OPTIONS.map((option) => (
                            <Radio key={option.value} value={option.value} size="xs" label={option.label} description={option.hint} disabled={savingStaffCardChange} />
                          ))}
                        </Stack>
                      </Radio.Group>
                      <Text size="10px" c="dimmed">
                        When someone leaves, their staff card stops working straight away. Either way, the earlier card stays on their phone until they remove it from Records.
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Paper>
            )}

            {canManageOrgSetup && section === 'store' && activeId && (
            <>
            <PublicOfferingsCard
              orgTenantId={activeId}
              onPreview={() => router.push(`/organizations/${activeId}?source=my-orgs`)}
            />

            <Paper id="org-card-store" p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700}>Ways to pay</Text>
                <Text size="xs" c="dimmed">Shown on your profile so people know how they can pay you.</Text>
                {storeLoading ? (
                  <Center py="xs"><Loader size="sm" /></Center>
                ) : (
                  <>
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
                  </>
                )}
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
