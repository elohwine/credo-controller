import { useState } from 'react';
import Head from 'next/head';
import Layout from '../../components/Layout';
import axios from 'axios';
import { BRAND, formatCurrency } from '@/lib/theme';
import QRCode from 'react-qr-code';
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  TicketIcon,
  ClipboardDocumentIcon,
  DevicePhoneMobileIcon,
  CalendarIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';

type StatementType = 'income' | 'balance' | 'cashflow';

const FinanceReports = () => {
  const [activeTab, setActiveTab] = useState<StatementType>('income');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-03-31');
  const [asOfDate, setAsOfDate] = useState('2026-03-31');
  const [report, setReport] = useState<any>(null);
  const [offerUri, setOfferUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

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
            params: { startDate, endDate }
          });
          break;
        case 'balance':
          response = await axios.get(`${baseUrl}/api/finance/balance-sheet`, {
            params: { asOfDate }
          });
          break;
        case 'cashflow':
          response = await axios.get(`${baseUrl}/api/finance/cash-flow`, {
            params: { startDate, endDate }
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
          });
          break;
        case 'balance':
          response = await axios.post(`${baseUrl}/api/finance/balance-sheet/offer`, {
            asOfDate
          });
          break;
        case 'cashflow':
          response = await axios.post(`${baseUrl}/api/finance/cash-flow/offer`, {
            startDate, endDate
          });
          break;
      }
      setOfferUri(response?.data.uri);
    } catch (err: any) {
      setError(err.message || 'Failed to issue credential');
    } finally {
      setLoading(false);
    }
  };

  const renderIncomeStatement = () => (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
      <div className="px-6 py-4 flex justify-between items-center" style={{ backgroundColor: BRAND.linkWater }}>
        <div className="flex items-center gap-3">
          <ChartBarIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
          <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Income Statement</h2>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: 'white', color: BRAND.curious }}>{report.statementId}</span>
      </div>
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-4">
          Period: {new Date(report.periodStart).toLocaleDateString()} - {new Date(report.periodEnd).toLocaleDateString()}
        </p>
        
        <div className="space-y-4">
          {/* Revenue Section */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
            <div className="flex justify-between text-lg">
              <span className="font-medium" style={{ color: BRAND.dark }}>Revenue</span>
              <span className="font-bold text-green-700">{formatCurrency(report.revenue)}</span>
            </div>
          </div>

          {/* Cost of Goods Sold */}
          <div className="flex justify-between pl-4">
            <span className="text-gray-600">Less: Cost of Goods Sold</span>
            <span className="text-red-600">({formatCurrency(report.costOfGoodsSold)})</span>
          </div>

          {/* Gross Profit */}
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium" style={{ color: BRAND.dark }}>Gross Profit</span>
            <span className="font-semibold">{formatCurrency(report.grossProfit)}</span>
          </div>

          {/* Operating Expenses */}
          <div className="flex justify-between pl-4">
            <span className="text-gray-600">Less: Operating Expenses</span>
            <span className="text-red-600">({formatCurrency(report.operatingExpenses)})</span>
          </div>

          {/* Breakdown */}
          <div className="pl-8 text-sm text-gray-500 space-y-1">
            <div className="flex justify-between"><span>• Payroll</span><span>{formatCurrency(report.breakdown?.payroll || 0)}</span></div>
            <div className="flex justify-between"><span>• Operations</span><span>{formatCurrency(report.breakdown?.operations || 0)}</span></div>
          </div>

          {/* Operating Income */}
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium" style={{ color: BRAND.dark }}>Operating Income</span>
            <span className="font-semibold">{formatCurrency(report.operatingIncome)}</span>
          </div>

          {/* Net Income */}
          <div className="p-4 rounded-lg mt-4" style={{ backgroundColor: report.netIncome >= 0 ? '#dcfce7' : '#fee2e2' }}>
            <div className="flex justify-between text-xl">
              <span className="font-bold">Net Income</span>
              <span className={`font-bold ${report.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(report.netIncome)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBalanceSheet = () => (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
      <div className="px-6 py-4 flex justify-between items-center" style={{ backgroundColor: BRAND.linkWater }}>
        <div className="flex items-center gap-3">
          <ClipboardDocumentListIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
          <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Balance Sheet</h2>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: 'white', color: BRAND.curious }}>{report.statementId}</span>
      </div>
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-4">As of: {new Date(report.asOfDate).toLocaleDateString()}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets */}
          <div>
            <h3 className="font-bold text-lg mb-3 pb-2 border-b" style={{ color: BRAND.dark, borderColor: BRAND.viking }}>ASSETS</h3>
            
            <div className="mb-4">
              <h4 className="font-medium text-gray-600 mb-2">Current Assets</h4>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Cash</span><span>{formatCurrency(report.cash)}</span></div>
                <div className="flex justify-between"><span>Accounts Receivable</span><span>{formatCurrency(report.accountsReceivable)}</span></div>
                <div className="flex justify-between"><span>Inventory</span><span>{formatCurrency(report.inventory)}</span></div>
              </div>
              <div className="flex justify-between mt-2 pt-1 border-t font-medium">
                <span>Total Current Assets</span>
                <span>{formatCurrency(report.currentAssets)}</span>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-medium text-gray-600 mb-2">Non-Current Assets</h4>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Property, Plant & Equipment</span><span>{formatCurrency(report.propertyPlantEquipment)}</span></div>
              </div>
              <div className="flex justify-between mt-2 pt-1 border-t font-medium">
                <span>Total Non-Current Assets</span>
                <span>{formatCurrency(report.nonCurrentAssets)}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg font-bold text-lg" style={{ backgroundColor: BRAND.linkWater }}>
              <div className="flex justify-between">
                <span style={{ color: BRAND.dark }}>TOTAL ASSETS</span>
                <span style={{ color: BRAND.curious }}>{formatCurrency(report.totalAssets)}</span>
              </div>
            </div>
          </div>

          {/* Liabilities & Equity */}
          <div>
            <h3 className="font-bold text-lg mb-3 pb-2 border-b" style={{ color: BRAND.dark, borderColor: BRAND.viking }}>LIABILITIES & EQUITY</h3>
            
            <div className="mb-4">
              <h4 className="font-medium text-gray-600 mb-2">Current Liabilities</h4>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Accounts Payable</span><span>{formatCurrency(report.accountsPayable)}</span></div>
                <div className="flex justify-between"><span>Short-Term Debt</span><span>{formatCurrency(report.shortTermDebt)}</span></div>
              </div>
              <div className="flex justify-between mt-2 pt-1 border-t font-medium">
                <span>Total Current Liabilities</span>
                <span>{formatCurrency(report.currentLiabilities)}</span>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-medium text-gray-600 mb-2">Non-Current Liabilities</h4>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Long-Term Debt</span><span>{formatCurrency(report.longTermDebt)}</span></div>
              </div>
              <div className="flex justify-between mt-2 pt-1 border-t font-medium">
                <span>Total Non-Current Liabilities</span>
                <span>{formatCurrency(report.nonCurrentLiabilities)}</span>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#fef3c7' }}>
              <h4 className="font-medium mb-2">Equity</h4>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Share Capital</span><span>{formatCurrency(report.shareCapital)}</span></div>
                <div className="flex justify-between"><span>Retained Earnings</span><span>{formatCurrency(report.retainedEarnings)}</span></div>
              </div>
              <div className="flex justify-between mt-2 pt-1 border-t font-bold">
                <span>Total Equity</span>
                <span>{formatCurrency(report.totalEquity)}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg font-bold text-lg" style={{ backgroundColor: BRAND.linkWater }}>
              <div className="flex justify-between">
                <span style={{ color: BRAND.dark }}>TOTAL L + E</span>
                <span style={{ color: BRAND.curious }}>{formatCurrency(report.totalLiabilities + report.totalEquity)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCashFlowStatement = () => (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
      <div className="px-6 py-4 flex justify-between items-center" style={{ backgroundColor: BRAND.linkWater }}>
        <div className="flex items-center gap-3">
          <BanknotesIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
          <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Cash Flow Statement</h2>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: 'white', color: BRAND.curious }}>{report.statementId}</span>
      </div>
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-4">
          Period: {new Date(report.periodStart).toLocaleDateString()} - {new Date(report.periodEnd).toLocaleDateString()}
        </p>
        
        <div className="space-y-6">
          {/* Operating Activities */}
          <div>
            <h3 className="font-bold mb-2" style={{ color: BRAND.dark }}>Operating Activities</h3>
            <div className="pl-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>Net Income</span><span>{formatCurrency(report.netIncome)}</span></div>
              <div className="flex justify-between"><span>Add: Depreciation</span><span>{formatCurrency(report.depreciation)}</span></div>
              <div className="flex justify-between"><span>Changes in Working Capital</span><span>{formatCurrency(report.changesInWorkingCapital)}</span></div>
            </div>
            <div className="flex justify-between mt-2 pt-1 border-t font-medium pl-4" style={{ color: report.cashFromOperations >= 0 ? 'green' : 'red' }}>
              <span>Cash from Operations</span>
              <span>{formatCurrency(report.cashFromOperations)}</span>
            </div>
          </div>

          {/* Investing Activities */}
          <div>
            <h3 className="font-bold mb-2" style={{ color: BRAND.dark }}>Investing Activities</h3>
            <div className="pl-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>Capital Expenditures</span><span className="text-red-600">({formatCurrency(Math.abs(report.capitalExpenditures))})</span></div>
              <div className="flex justify-between"><span>Asset Sales</span><span>{formatCurrency(report.assetSales)}</span></div>
            </div>
            <div className="flex justify-between mt-2 pt-1 border-t font-medium pl-4" style={{ color: report.cashFromInvesting >= 0 ? 'green' : 'red' }}>
              <span>Cash from Investing</span>
              <span>{formatCurrency(report.cashFromInvesting)}</span>
            </div>
          </div>

          {/* Financing Activities */}
          <div>
            <h3 className="font-bold mb-2" style={{ color: BRAND.dark }}>Financing Activities</h3>
            <div className="pl-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>Debt Proceeds</span><span>{formatCurrency(report.debtProceeds)}</span></div>
              <div className="flex justify-between"><span>Debt Repayments</span><span className="text-red-600">({formatCurrency(Math.abs(report.debtRepayments))})</span></div>
              <div className="flex justify-between"><span>Dividends Paid</span><span className="text-red-600">({formatCurrency(Math.abs(report.dividendsPaid))})</span></div>
            </div>
            <div className="flex justify-between mt-2 pt-1 border-t font-medium pl-4" style={{ color: report.cashFromFinancing >= 0 ? 'green' : 'red' }}>
              <span>Cash from Financing</span>
              <span>{formatCurrency(report.cashFromFinancing)}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
            <div className="flex justify-between mb-2">
              <span className="font-medium" style={{ color: BRAND.dark }}>Beginning Cash</span>
              <span>{formatCurrency(report.beginningCash)}</span>
            </div>
            <div className="flex justify-between mb-2 text-lg" style={{ color: report.netCashFlow >= 0 ? 'green' : 'red' }}>
              <span className="font-bold">Net Cash Flow</span>
              <span className="font-bold">{formatCurrency(report.netCashFlow)}</span>
            </div>
            <div className="flex justify-between text-xl pt-2 border-t" style={{ borderColor: BRAND.curious }}>
              <span className="font-bold" style={{ color: BRAND.dark }}>Ending Cash</span>
              <span className="font-bold" style={{ color: BRAND.curious }}>{formatCurrency(report.endingCash)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      <Head>
        <title>Financial Statements | Credentis Portal</title>
      </Head>
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Financial Statements</h1>
            <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Generate verifiable financial reports with SSI credentials</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          {[
            { label: 'Income Statement', desc: 'Revenue & Expenses', icon: <ChartBarIcon className="h-6 w-6" /> },
            { label: 'Balance Sheet', desc: 'Assets & Liabilities', icon: <ClipboardDocumentListIcon className="h-6 w-6" /> },
            { label: 'Cash Flow', desc: 'Operating & Financing', icon: <BanknotesIcon className="h-6 w-6" /> },
          ].map((stat, idx) => (
            <div key={idx} className="relative overflow-hidden rounded-xl p-6 shadow-sm hover:shadow-md transition-all" style={{ backgroundColor: BRAND.linkWater }}>
              <dt>
                <div className="absolute rounded-lg p-3" style={{ backgroundColor: BRAND.curious }}>
                  <span className="text-white">{stat.icon}</span>
                </div>
                <p className="ml-16 truncate text-sm font-medium" style={{ color: BRAND.dark }}>{stat.label}</p>
              </dt>
              <dd className="ml-16 flex items-baseline">
                <p className="text-sm text-gray-500">{stat.desc}</p>
              </dd>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex flex-wrap gap-6">
            {[
              { key: 'income' as StatementType, label: 'Income Statement', icon: <ChartBarIcon className="h-5 w-5" /> },
              { key: 'balance' as StatementType, label: 'Balance Sheet', icon: <ClipboardDocumentListIcon className="h-5 w-5" /> },
              { key: 'cashflow' as StatementType, label: 'Cash Flow', icon: <BanknotesIcon className="h-5 w-5" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setReport(null); setOfferUri(null); }}
                className="group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors"
                style={{
                  borderColor: activeTab === tab.key ? BRAND.curious : 'transparent',
                  color: activeTab === tab.key ? BRAND.curious : '#6B7280'
                }}
              >
                {tab.icon}<span className="ml-2">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Date Selection */}
        <div className="rounded-xl shadow-sm overflow-hidden mb-6" style={{ backgroundColor: 'white' }}>
          <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
              <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>
                {activeTab === 'balance' ? 'Select Date' : 'Select Period'}
              </h2>
            </div>
          </div>
          <div className="p-6">
            <div className="flex gap-4 items-end flex-wrap">
              {activeTab !== 'balance' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Start Date</label>
                    <input 
                      type="date" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      className="rounded-lg border-gray-300 shadow-sm focus:ring-2"
                      style={{ borderColor: BRAND.viking }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>End Date</label>
                    <input 
                      type="date" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-lg border-gray-300 shadow-sm focus:ring-2"
                      style={{ borderColor: BRAND.viking }}
                    />
                  </div>
                </>
              )}
              {activeTab === 'balance' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>As of Date</label>
                  <input 
                    type="date" 
                    value={asOfDate} 
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="rounded-lg border-gray-300 shadow-sm focus:ring-2"
                    style={{ borderColor: BRAND.viking }}
                  />
                </div>
              )}
              <button 
                onClick={fetchReport}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                style={{ backgroundColor: BRAND.curious }}
              >
                {loading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <DocumentTextIcon className="h-5 w-5" />}
                {loading ? 'Loading...' : 'Generate Report'}
              </button>
            </div>
            {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
          </div>
        </div>

        {/* Report Display */}
        {report && (
          <div className="space-y-6">
            {activeTab === 'income' && renderIncomeStatement()}
            {activeTab === 'balance' && renderBalanceSheet()}
            {activeTab === 'cashflow' && renderCashFlowStatement()}

            {/* VC Issuance */}
            <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
              <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                <div className="flex items-center gap-3">
                  <TicketIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                  <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Issue Verifiable Credential</h3>
                </div>
              </div>
              <div className="p-6">
                {!offerUri ? (
                  <button 
                    onClick={issueCredential}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                    style={{ backgroundColor: BRAND.dark }}
                  >
                    <CurrencyDollarIcon className="h-5 w-5" />
                    Issue {activeTab === 'income' ? 'IncomeStatementVC' : activeTab === 'balance' ? 'BalanceSheetVC' : 'CashFlowVC'}
                  </button>
                ) : (
                  <div className="flex justify-center">
                    <div className="shadow-2xl rounded-xl p-8 bg-white max-w-md w-full text-center">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Claim Your Credential
                      </h3>
                      <p className="text-sm text-gray-600 mb-6">
                        Scan the QR code or open in your wallet
                      </p>
                      <div className="flex justify-center mb-6">
                        <QRCode
                          className="h-full max-h-[200px]"
                          value={offerUri}
                          viewBox="0 0 256 256"
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <a
                          href={offerUri}
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-md"
                          style={{ backgroundColor: BRAND.curious }}
                        >
                          <DevicePhoneMobileIcon className="h-5 w-5" />
                          Open in Wallet
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(offerUri);
                            alert('Offer link copied!');
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium border transition-colors hover:bg-gray-50"
                          style={{ borderColor: BRAND.curious, color: BRAND.curious }}
                        >
                          <ClipboardDocumentIcon className="h-5 w-5" />
                          Copy offer URL
                        </button>
                      </div>
                      <div className="flex flex-col items-center mt-8 pt-6 border-t">
                        <div className="flex flex-row gap-2 items-center text-sm" style={{ color: '#7B8794' }}>
                          <p>Secured by Credentis</p>
                          <img src="/credentis-logo.png" alt="Credentis" style={{ height: 15, width: 'auto' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default FinanceReports;
