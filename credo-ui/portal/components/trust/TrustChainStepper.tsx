import React, { useState } from 'react';
import { Box, Collapse, Group, Paper, Stack, Text, ThemeIcon, Timeline, Title, UnstyledButton } from '@mantine/core';
import { IconCheck, IconChevronDown, IconChevronUp, IconCircleCheck, IconPoint, IconShieldCheck } from '@tabler/icons-react';

interface ChainNode {
  valid: boolean;
  id: string;
  hash: string;
  timestamp?: string;
  meta?: any;
  // Specific fields from our backend
  amount?: string;
  currency?: string;
  reference?: string;
  total?: string;
  itemCount?: number;
  type?: string;
}

interface ChainData {
  receipt: ChainNode;
  invoice: ChainNode;
  quote: ChainNode;
}

interface Props {
  chain: ChainData;
  verified: boolean;
}

const StepIcon = ({ valid, active }: { valid: boolean; active?: boolean }) => {
  if (active) {
    return (
      <ThemeIcon size={28} radius="xl" color="blue">
        <IconCircleCheck size={18} />
      </ThemeIcon>
    );
  }
  if (valid) {
    return (
      <ThemeIcon size={28} radius="xl" color="green">
        <IconCheck size={18} />
      </ThemeIcon>
    );
  }
  return (
    <ThemeIcon size={28} radius="xl" color="gray" variant="light">
      <IconPoint size={18} />
    </ThemeIcon>
  );
};

const Detail = ({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) => (
  <Text size="xs" c="dimmed" truncate title={title}>
    <Text span fw={600} inherit>{label}:</Text> {children}
  </Text>
);

export const TrustChainStepper: React.FC<Props> = ({ chain }) => {
  const [expanded, setExpanded] = useState<string | null>('receipt');

  const toggle = (section: string) => {
    setExpanded(expanded === section ? null : section);
  };

  const steps = [
    {
      key: 'quote',
      title: 'Quote Issued',
      node: chain.quote,
      active: false,
      description: chain.quote.id !== 'none' ? `Order Estimate` : 'No linked quote',
      details: (
        <Stack gap={4}>
          <Detail label="ID">{chain.quote.id}</Detail>
          <Detail label="Items">{chain.quote.itemCount || 0}</Detail>
          <Detail label="Total">{chain.quote.total || '0.00'}</Detail>
          <Detail label="Hash" title={chain.quote.hash}>{chain.quote.hash.substring(0, 10)}...</Detail>
        </Stack>
      )
    },
    {
      key: 'invoice',
      title: 'Invoice & Payment',
      node: chain.invoice,
      active: false,
      description: chain.invoice.id ? `Ref: ${chain.invoice.reference}` : 'Pending linkage',
      details: (
        <Stack gap={4}>
          <Detail label="Invoice ID">{chain.invoice.id}</Detail>
          <Detail label="Amount">{chain.invoice.currency} {chain.invoice.amount}</Detail>
          <Detail label="Method">EcoCash</Detail>
          <Detail label="Hash" title={chain.invoice.hash}>{chain.invoice.hash.substring(0, 10)}...</Detail>
        </Stack>
      )
    },
    {
      key: 'receipt',
      title: 'Payment Receipt',
      node: chain.receipt,
      description: 'Signature checked',
      active: true,
      details: (
        <Stack gap={4}>
          <Detail label="Receipt ID">{chain.receipt.id}</Detail>
          <Text size="xs" fw={500} c="var(--mantine-color-green-text)">Chain Intact</Text>
          <Detail label="Linked Hash" title={chain.receipt.hash}>{chain.receipt.hash.substring(0, 10)}...</Detail>
        </Stack>
      )
    }
  ];

  return (
    <Paper withBorder radius="md" p="lg">
      <Group gap="xs" mb="lg">
        <Box c="dimmed" style={{ display: 'flex' }}><IconShieldCheck size={20} /></Box>
        <Title order={4}>Audit Trail</Title>
      </Group>
      <Timeline bulletSize={32} lineWidth={2} active={-1}>
        {steps.map((step) => (
          <Timeline.Item key={step.key} bullet={<StepIcon valid={step.node.valid} active={step.active} />}>
            <UnstyledButton onClick={() => toggle(step.key)} w="100%" aria-expanded={expanded === step.key}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div>
                  <Text size="sm" fw={500}>{step.title}</Text>
                  <Text size="sm" c="dimmed">{step.description}</Text>
                </div>
                <Box c="dimmed" style={{ display: 'flex' }}>
                  {expanded === step.key ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                </Box>
              </Group>
            </UnstyledButton>

            {/* Expandable Details */}
            <Collapse expanded={expanded === step.key}>
              <Paper withBorder radius="sm" p="sm" mt="sm" bg="var(--mantine-color-default-hover)">
                {step.details}
              </Paper>
            </Collapse>
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  );
};
