import { PRODUCT_NAME } from '@/utils/orgProfile'
import { useState, useEffect, useContext } from 'react';
import Head from 'next/head';
import type { ReactNode } from 'react';
import Layout from '../../components/Layout';
import axios from 'axios';
import { formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import QRCode from 'react-qr-code';
import {
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconCalendar,
  IconChartBar,
  IconClipboardList,
  IconCash,
  IconCopy,
  IconDeviceMobile,
  IconFileText,
  IconSend,
} from '@tabler/icons-react';

import { useRequireOrgContext } from '@/lib/portalContext';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { getPreferredTenantToken } from '@/utils/portalTenant';
type StatementType = 'income' | 'balance' | 'cashflow';

const POSITIVE = 'var(--mantine-color-success-7, var(--mantine-color-green-7))';
const NEGATIVE = 'var(--mantine-color-danger-7, var(--mantine-color-red-7))';
const SUBTLE_BG = 'var(--mantine-color-default-hover)';

const Line = ({ label, value, valueColor, strong, indent = 0, size }: {
  label: ReactNode;
  value: ReactNode;
  valueColor?: string;
  strong?: boolean;
  indent?: number | string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) => (
  <Group justify="space-between" wrap="nowrap" pl={indent} gap="sm">
    <Text size={size} fw={strong ? 600 : undefined}>{label}</Text>
    <Text size={size} fw={strong ? 600 : undefined} c={valueColor} style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
  </Group>
);

const Subtotal = ({ label, value, color, bold }: { label: ReactNode; value: ReactNode; color?: string; bold?: boolean }) => (
  <Box pt={4} mt={4} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" fw={bold ? 700 : 600} c={color}>{label}</Text>
      <Text size="sm" fw={bold ? 700 : 600} c={color} style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
    </Group>
  </Box>
);

const Highlight = ({ children }: { children: ReactNode }) => (
  <Paper p="sm" radius="md" bg={SUBTLE_BG}>{children}</Paper>
);

const ReportCard = ({ icon, title, reference, children }: { icon: ReactNode; title: string; reference?: string; children: ReactNode }) => (
  <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
    <Group justify="space-between" px="lg" py="sm" bg={SUBTLE_BG} wrap="wrap" gap="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group gap="xs">
        <Box c="dimmed" style={{ display: 'flex' }}>{icon}</Box>
        <Title order={4}>{title}</Title>
      </Group>
      {reference && <Badge variant="default" radius="sm" ff="monospace" tt="none">{reference}</Badge>}
    </Group>
    <Box p="lg">{children}</Box>
  </Paper>
);

const FinanceReports = () => {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox');

  const [activeTab, setActiveTab] = useState<StatementType>('income');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-03-31');
  const [asOfDate, setAsOfDate] = useState('2026-03-31');
  const [report, setReport] = useState<any>(null);
  const [offerUri, setOfferUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const env = useContext(EnvContext);
  const baseUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const auth = () => ({
    headers: {
      Authorization: `Bearer ${
        getOrgScopedToken() || getPreferredTenantToken() || localStorage.getItem('walletToken') || ''
      }`,
    },
  });

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    setOfferUri(null);
    try {
      let response;
      switch (activeTab) {
        case 'income':
          response = await axios.get(`${baseUrl}/api/finance/income-statement`, {
            params: { startDate, endDate },
            ...auth(),
          });
          break;
        case 'balance':
          response = await axios.get(`${baseUrl}/api/finance/balance-sheet`, {
            params: { asOfDate },
            ...auth(),
          });
          break;
        case 'cashflow':
          response = await axios.get(`${baseUrl}/api/finance/cash-flow`, {
            params: { startDate, endDate },
            ...auth(),
          });
          break;
      }
      setReport(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  const issueCredential = async () => {
    setLoading(true);
    try {
      let response;
      switch (activeTab) {
        case 'income':
          response = await axios.post(`${baseUrl}/api/finance/income-statement/offer`, {
            startDate, endDate
          }, auth());
          break;
        case 'balance':
          response = await axios.post(`${baseUrl}/api/finance/balance-sheet/offer`, {
            asOfDate
          }, auth());
          break;
        case 'cashflow':
          response = await axios.post(`${baseUrl}/api/finance/cash-flow/offer`, {
            startDate, endDate
          }, auth());
          break;
      }
      setOfferUri(response?.data.uri);
    } catch (err: any) {
      setError(err.message || 'Failed to create signed copy');
    } finally {
      setLoading(false);
    }
  };

  const renderIncomeStatement = () => (
    <ReportCard icon={<IconChartBar size={18} />} title="Income Statement" reference={report.statementId}>
      <Text size="sm" c="dimmed" mb="md">
        Period: {new Date(report.periodStart).toLocaleDateString()} - {new Date(report.periodEnd).toLocaleDateString()}
      </Text>

      <Stack gap="sm">
        {/* Revenue Section */}
        <Highlight>
          <Line size="lg" strong label="Revenue" value={formatCurrency(report.revenue)} valueColor={POSITIVE} />
        </Highlight>

        {/* Cost of Goods Sold */}
        <Line indent="md" label={<Text span c="dimmed">Less: Cost of Goods Sold</Text>} value={`(${formatCurrency(report.costOfGoodsSold)})`} valueColor={NEGATIVE} />

        {/* Gross Profit */}
        <Subtotal label="Gross Profit" value={formatCurrency(report.grossProfit)} />

        {/* Operating Expenses */}
        <Line indent="md" label={<Text span c="dimmed">Less: Operating Expenses</Text>} value={`(${formatCurrency(report.operatingExpenses)})`} valueColor={NEGATIVE} />

        {/* Breakdown */}
        <Stack gap={4} pl="xl">
          <Line size="sm" label={<Text span size="sm" c="dimmed">• Payroll</Text>} value={formatCurrency(report.breakdown?.payroll || 0)} valueColor="dimmed" />
          <Line size="sm" label={<Text span size="sm" c="dimmed">• Operations</Text>} value={formatCurrency(report.breakdown?.operations || 0)} valueColor="dimmed" />
        </Stack>

        {/* Operating Income */}
        <Subtotal label="Operating Income" value={formatCurrency(report.operatingIncome)} />

        {/* Net Income */}
        <Paper p="md" radius="md" mt="sm" bg={SUBTLE_BG}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="xl" fw={700}>Net Income</Text>
            <Text size="xl" fw={700} c={report.netIncome >= 0 ? POSITIVE : NEGATIVE}>{formatCurrency(report.netIncome)}</Text>
          </Group>
        </Paper>
      </Stack>
    </ReportCard>
  );

  const sectionHeading = (label: string) => (
    <Text fw={700} size="lg" pb={6} mb="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>{label}</Text>
  );

  const renderBalanceSheet = () => (
    <ReportCard icon={<IconClipboardList size={18} />} title="Balance Sheet" reference={report.statementId}>
      <Text size="sm" c="dimmed" mb="md">As of: {new Date(report.asOfDate).toLocaleDateString()}</Text>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        {/* Assets */}
        <div>
          {sectionHeading('ASSETS')}

          <Box mb="md">
            <Text fw={500} c="dimmed" mb={6}>Current Assets</Text>
            <Stack gap={4} pl="md">
              <Line size="sm" label="Cash" value={formatCurrency(report.cash)} />
              <Line size="sm" label="Accounts Receivable" value={formatCurrency(report.accountsReceivable)} />
              <Line size="sm" label="Inventory" value={formatCurrency(report.inventory)} />
            </Stack>
            <Subtotal label="Total Current Assets" value={formatCurrency(report.currentAssets)} />
          </Box>

          <Box mb="md">
            <Text fw={500} c="dimmed" mb={6}>Non-Current Assets</Text>
            <Stack gap={4} pl="md">
              <Line size="sm" label="Property, Plant & Equipment" value={formatCurrency(report.propertyPlantEquipment)} />
            </Stack>
            <Subtotal label="Total Non-Current Assets" value={formatCurrency(report.nonCurrentAssets)} />
          </Box>

          <Highlight>
            <Line size="lg" strong label={<Text span fw={700} size="lg">TOTAL ASSETS</Text>} value={<Text span fw={700} size="lg">{formatCurrency(report.totalAssets)}</Text>} />
          </Highlight>
        </div>

        {/* Liabilities & Equity */}
        <div>
          {sectionHeading('LIABILITIES & EQUITY')}

          <Box mb="md">
            <Text fw={500} c="dimmed" mb={6}>Current Liabilities</Text>
            <Stack gap={4} pl="md">
              <Line size="sm" label="Accounts Payable" value={formatCurrency(report.accountsPayable)} />
              <Line size="sm" label="Short-Term Debt" value={formatCurrency(report.shortTermDebt)} />
            </Stack>
            <Subtotal label="Total Current Liabilities" value={formatCurrency(report.currentLiabilities)} />
          </Box>

          <Box mb="md">
            <Text fw={500} c="dimmed" mb={6}>Non-Current Liabilities</Text>
            <Stack gap={4} pl="md">
              <Line size="sm" label="Long-Term Debt" value={formatCurrency(report.longTermDebt)} />
            </Stack>
            <Subtotal label="Total Non-Current Liabilities" value={formatCurrency(report.nonCurrentLiabilities)} />
          </Box>

          <Paper withBorder p="sm" radius="md" mb="md">
            <Text fw={500} mb={6}>Equity</Text>
            <Stack gap={4} pl="md">
              <Line size="sm" label="Share Capital" value={formatCurrency(report.shareCapital)} />
              <Line size="sm" label="Retained Earnings" value={formatCurrency(report.retainedEarnings)} />
            </Stack>
            <Subtotal bold label="Total Equity" value={formatCurrency(report.totalEquity)} />
          </Paper>

          <Highlight>
            <Line size="lg" strong label={<Text span fw={700} size="lg">TOTAL L + E</Text>} value={<Text span fw={700} size="lg">{formatCurrency(report.totalLiabilities + report.totalEquity)}</Text>} />
          </Highlight>
        </div>
      </SimpleGrid>
    </ReportCard>
  );

  const signColor = (value: number) => (value >= 0 ? POSITIVE : NEGATIVE);

  const renderCashFlowStatement = () => (
    <ReportCard icon={<IconCash size={18} />} title="Cash Flow Statement" reference={report.statementId}>
      <Text size="sm" c="dimmed" mb="md">
        Period: {new Date(report.periodStart).toLocaleDateString()} - {new Date(report.periodEnd).toLocaleDateString()}
      </Text>

      <Stack gap="lg">
        {/* Operating Activities */}
        <div>
          <Text fw={700} mb={6}>Operating Activities</Text>
          <Stack gap={4} pl="md">
            <Line size="sm" label="Net Income" value={formatCurrency(report.netIncome)} />
            <Line size="sm" label="Add: Depreciation" value={formatCurrency(report.depreciation)} />
            <Line size="sm" label="Changes in Working Capital" value={formatCurrency(report.changesInWorkingCapital)} />
          </Stack>
          <Box pl="md"><Subtotal label="Cash from Operations" value={formatCurrency(report.cashFromOperations)} color={signColor(report.cashFromOperations)} /></Box>
        </div>

        {/* Investing Activities */}
        <div>
          <Text fw={700} mb={6}>Investing Activities</Text>
          <Stack gap={4} pl="md">
            <Line size="sm" label="Capital Expenditures" value={`(${formatCurrency(Math.abs(report.capitalExpenditures))})`} valueColor={NEGATIVE} />
            <Line size="sm" label="Asset Sales" value={formatCurrency(report.assetSales)} />
          </Stack>
          <Box pl="md"><Subtotal label="Cash from Investing" value={formatCurrency(report.cashFromInvesting)} color={signColor(report.cashFromInvesting)} /></Box>
        </div>

        {/* Financing Activities */}
        <div>
          <Text fw={700} mb={6}>Financing Activities</Text>
          <Stack gap={4} pl="md">
            <Line size="sm" label="Debt Proceeds" value={formatCurrency(report.debtProceeds)} />
            <Line size="sm" label="Debt Repayments" value={`(${formatCurrency(Math.abs(report.debtRepayments))})`} valueColor={NEGATIVE} />
            <Line size="sm" label="Dividends Paid" value={`(${formatCurrency(Math.abs(report.dividendsPaid))})`} valueColor={NEGATIVE} />
          </Stack>
          <Box pl="md"><Subtotal label="Cash from Financing" value={formatCurrency(report.cashFromFinancing)} color={signColor(report.cashFromFinancing)} /></Box>
        </div>

        {/* Summary */}
        <Paper p="md" radius="md" bg={SUBTLE_BG}>
          <Stack gap="xs">
            <Line strong label="Beginning Cash" value={formatCurrency(report.beginningCash)} />
            <Group justify="space-between" wrap="nowrap">
              <Text size="lg" fw={700} c={signColor(report.netCashFlow)}>Net Cash Flow</Text>
              <Text size="lg" fw={700} c={signColor(report.netCashFlow)}>{formatCurrency(report.netCashFlow)}</Text>
            </Group>
            <Divider />
            <Group justify="space-between" wrap="nowrap">
              <Text size="xl" fw={700}>Ending Cash</Text>
              <Text size="xl" fw={700}>{formatCurrency(report.endingCash)}</Text>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </ReportCard>
  );

  const statementName = activeTab === 'income' ? 'income statement' : activeTab === 'balance' ? 'balance sheet' : 'cash flow statement';

  return (
    <Layout>
      <Head>
        <title>{`Financial Statements | ${PRODUCT_NAME} Portal`}</title>
      </Head>
      <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
        {/* Header */}
        <div>
          <Title order={2}>Financial Statements</Title>
          <Text size="sm" c="dimmed" mt={4}>Generate income statements, balance sheets and cash flow reports, and share signed copies.</Text>
        </div>

        {/* Stats */}

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(value) => {
            if (!value) return;
            setActiveTab(value as StatementType);
            setReport(null);
            setOfferUri(null);
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="income" leftSection={<IconChartBar size={16} />}>Income Statement</Tabs.Tab>
            <Tabs.Tab value="balance" leftSection={<IconClipboardList size={16} />}>Balance Sheet</Tabs.Tab>
            <Tabs.Tab value="cashflow" leftSection={<IconCash size={16} />}>Cash Flow</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {/* Date Selection */}
        <ReportCard icon={<IconCalendar size={18} />} title={activeTab === 'balance' ? 'Select Date' : 'Select Period'}>
          <Group align="flex-end" gap="md" wrap="wrap">
            {activeTab !== 'balance' && (
              <>
                <TextInput type="date" label="Start Date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} />
                <TextInput type="date" label="End Date" value={endDate} onChange={(e) => setEndDate(e.currentTarget.value)} />
              </>
            )}
            {activeTab === 'balance' && (
              <TextInput type="date" label="As of Date" value={asOfDate} onChange={(e) => setAsOfDate(e.currentTarget.value)} />
            )}
            <Button onClick={fetchReport} loading={loading} leftSection={<IconFileText size={16} />}>
              Generate Report
            </Button>
          </Group>
          {error && <Text c="red" size="sm" mt="md">{error}</Text>}
        </ReportCard>

        {/* Report Display */}
        {report && (
          <Stack gap="lg">
            {activeTab === 'income' && renderIncomeStatement()}
            {activeTab === 'balance' && renderBalanceSheet()}
            {activeTab === 'cashflow' && renderCashFlowStatement()}

            {/* Signed copy */}
            <ReportCard icon={<IconSend size={18} />} title="Share a signed copy">
              {!offerUri ? (
                <Button onClick={issueCredential} disabled={loading} variant="default" leftSection={<IconSend size={16} />}>
                  Create signed {statementName}
                </Button>
              ) : (
                <Center>
                  <Paper withBorder shadow="sm" radius="md" p="xl" maw={420} w="100%">
                    <Stack gap="md" align="stretch" ta="center">
                      <div>
                        <Title order={4}>Save this {statementName}</Title>
                        <Text size="sm" c="dimmed" mt={4}>Scan the QR code or open it in the {PRODUCT_NAME} app</Text>
                      </div>
                      <Center p="md" bg="white" style={{ borderRadius: 'var(--mantine-radius-md)' }}>
                        <QRCode value={offerUri} size={200} viewBox="0 0 256 256" />
                      </Center>
                      <Button component="a" href={offerUri} leftSection={<IconDeviceMobile size={16} />}>
                        Open in app
                      </Button>
                      <Button
                        variant="default"
                        leftSection={<IconCopy size={16} />}
                        onClick={() => {
                          navigator.clipboard.writeText(offerUri);
                          alert('Offer link copied!');
                        }}
                      >
                        Copy link
                      </Button>
                      <Divider />
                      <Group justify="center" gap="xs">
                        <Text size="sm" c="dimmed">Secured by {PRODUCT_NAME}</Text>
                        <Image src="/brand-logo.svg" alt={PRODUCT_NAME} h={15} w="auto" />
                      </Group>
                    </Stack>
                  </Paper>
                </Center>
              )}
            </ReportCard>
          </Stack>
        )}
      </Stack>
    </Layout>
  );
};

export default FinanceReports;
