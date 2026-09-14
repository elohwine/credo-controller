import {
  IconShoppingCart,
  IconFileInvoice,
  IconSchool,
  IconCash,
  IconTruck,
} from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';

export interface ModuleConfig {
  featureKey: string;
  label: string;
  description: string;
  icon: TablerIcon;
  color: string;
  accentColor: string;
  inboxFilter: string;
  actions: string[];
}

export const MODULE_REGISTRY: ModuleConfig[] = [
  {
    featureKey: 'ECOMMERCE',
    label: 'Orders & Deliveries',
    description: 'Track orders, confirm deliveries, issue receipts',
    icon: IconShoppingCart,
    color: 'blue',
    accentColor: '#2188ca',
    inboxFilter: 'ecommerce',
    actions: ['View orders', 'Confirm delivery', 'Issue receipt'],
  },
  {
    featureKey: 'INTERNAL_REQUISITIONS',
    label: 'Requisitions',
    description: 'Review and approve procurement requests',
    icon: IconFileInvoice,
    color: 'violet',
    accentColor: '#7c3aed',
    inboxFilter: 'requisitions',
    actions: ['Pending approvals', 'New request'],
  },
  {
    featureKey: 'EDUCATION_FEES',
    label: 'Fee Payments',
    description: 'Fee collection, receipts, and payment verification',
    icon: IconSchool,
    color: 'teal',
    accentColor: '#0d9488',
    inboxFilter: 'education',
    actions: ['Pending payments', 'Issue receipt'],
  },
  {
    featureKey: 'CASH_COUNTER',
    label: 'Cash Counter',
    description: 'Cash transactions, reconciliation, and receipts',
    icon: IconCash,
    color: 'green',
    accentColor: '#16a34a',
    inboxFilter: 'cash',
    actions: ['Open session', 'Record transaction'],
  },
  {
    featureKey: 'FIELD_EXECUTION',
    label: 'Field Tasks',
    description: 'Field assignments, proof capture, and task completion',
    icon: IconTruck,
    color: 'orange',
    accentColor: '#ea580c',
    inboxFilter: 'field',
    actions: ['My tasks', 'Capture evidence'],
  },
];

export function getEnabledModules(features: string[]): ModuleConfig[] {
  if (!features || features.length === 0) return [];
  return MODULE_REGISTRY.filter((m) => features.includes(m.featureKey));
}

export function getModuleByFeature(featureKey: string): ModuleConfig | undefined {
  return MODULE_REGISTRY.find((m) => m.featureKey === featureKey);
}
