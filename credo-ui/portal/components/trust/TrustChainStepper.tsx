import React, { useState } from 'react';

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
      <span className="relative z-10 w-8 h-8 flex items-center justify-center bg-blue-600 rounded-full ring-8 ring-white">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full ring-8 ring-white ${valid ? 'bg-green-500' : 'bg-gray-200'}`}>
      {valid ? (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <span className="w-2.5 h-2.5 bg-gray-400 rounded-full" />
      )}
    </span>
  );
};

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
      description: chain.quote.id !== 'none' ? `Order Estimate` : 'No linked quote',
      details: (
        <div className="text-xs text-gray-500 space-y-1">
          <p><span className="font-semibold">ID:</span> {chain.quote.id}</p>
          <p><span className="font-semibold">Items:</span> {chain.quote.itemCount || 0}</p>
          <p><span className="font-semibold">Total:</span> {chain.quote.total || '0.00'}</p>
          <p className="truncate" title={chain.quote.hash}><span className="font-semibold">Hash:</span> {chain.quote.hash.substring(0, 10)}...</p>
        </div>
      )
    },
    {
      key: 'invoice',
      title: 'Invoice & Payment',
      node: chain.invoice,
      description: chain.invoice.id ? `Ref: ${chain.invoice.reference}` : 'Pending linkage',
      details: (
        <div className="text-xs text-gray-500 space-y-1">
           <p><span className="font-semibold">Invoice ID:</span> {chain.invoice.id}</p>
           <p><span className="font-semibold">Amount:</span> {chain.invoice.currency} {chain.invoice.amount}</p>
           <p><span className="font-semibold">Method:</span> EcoCash</p>
           <p className="truncate" title={chain.invoice.hash}><span className="font-semibold">Hash:</span> {chain.invoice.hash.substring(0, 10)}...</p>
        </div>
      )
    },
    {
      key: 'receipt',
      title: 'Payment Receipt',
      node: chain.receipt,
      description: 'Cryptographically Verified',
      active: true,
      details: (
        <div className="text-xs text-gray-500 space-y-1">
           <p><span className="font-semibold">Receipt ID:</span> {chain.receipt.id}</p>
           <p className="text-green-600 font-medium">Chain Intact</p>
           <p className="truncate" title={chain.receipt.hash}><span className="font-semibold">Linked Hash:</span> {chain.receipt.hash.substring(0, 10)}...</p>
        </div>
      )
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
        <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        Audit Trail
      </h3>
      <div className="flow-root">
        <ul className="-mb-8">
          {steps.map((step, stepIdx) => (
            <li key={step.key}>
              <div className="relative pb-8">
                {stepIdx !== steps.length - 1 ? (
                  <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <StepIcon valid={step.node.valid} active={step.active} />
                  </div>
                  <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                    <div className="w-full">
                      <div className="flex justify-between cursor-pointer" onClick={() => toggle(step.key)}>
                         <div>
                            <p className="text-sm font-medium text-gray-900">{step.title}</p>
                            <p className="text-sm text-gray-500">{step.description}</p>
                         </div>
                         <div className="text-gray-400">
                            {expanded === step.key ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            )}
                         </div>
                      </div>
                      
                      {/* Expandable Details */}
                      {expanded === step.key && (
                        <div className="mt-3 bg-gray-50 p-3 rounded-md border border-gray-100 transition-opacity duration-300 ease-in-out">
                             {step.details}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
