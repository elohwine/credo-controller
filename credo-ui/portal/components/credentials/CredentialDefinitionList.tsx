import React from 'react';

export interface CredentialDefinition {
  credentialDefinitionId: string;
  name: string;
  version: string;
  schemaId: string;
  issuerDid: string;
  credentialType: string[];
  format: string;
  claimsTemplate: Record<string, any>;
  createdAt: string;
}

interface CredentialDefinitionListProps {
  definitions: CredentialDefinition[];
}

// Group definitions by primary credential type
const groupByType = (defs: CredentialDefinition[]) => {
  const groups: Record<string, CredentialDefinition[]> = {};
  
  // Safety check: ensure defs is an array
  if (!Array.isArray(defs)) {
    console.warn('Expected definitions to be an array, received:', typeof defs);
    return groups;
  }
  
  defs.forEach(def => {
    // Use the last credentialType (most specific) as the group key
    const typeKey = def.credentialType[def.credentialType.length - 1] || 'Unknown';
    if (!groups[typeKey]) {
      groups[typeKey] = [];
    }
    groups[typeKey].push(def);
  });
  
  return groups;
};

// Map credential types to display names and colors
const typeMetadata: Record<string, { label: string; colorClass: string; iconBg: string }> = {
  PaymentReceipt: { 
    label: '💳 Payment & Transaction', 
    colorClass: 'border-green-500 bg-green-50', 
    iconBg: 'bg-green-700' 
  },
  GenericIDCredential: { 
    label: '🆔 Identity Documents', 
    colorClass: 'border-primary-400 bg-primary-50', 
    iconBg: 'bg-primary-700' 
  },
  OpenBadge: { 
    label: '🏅 Educational Badges', 
    colorClass: 'border-yellow-500 bg-yellow-50', 
    iconBg: 'bg-yellow-700' 
  },
  MdocHealthSummary: { 
    label: '🏥 mDoc Health Records', 
    colorClass: 'border-red-400 bg-red-50', 
    iconBg: 'bg-red-700' 
  },
  EHRSummary: { 
    label: '⚕️ EHR Clinical Data', 
    colorClass: 'border-orange-500 bg-orange-50', 
    iconBg: 'bg-orange-700' 
  },
};

const CredentialDefinitionList: React.FC<CredentialDefinitionListProps> = ({ definitions = [] }) => {
  const grouped = groupByType(definitions || []);
  
  if (!definitions || definitions.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500 text-lg">No credential definitions available.</p>
        <p className="text-gray-400 text-sm mt-2">Seed models with: <code className="bg-gray-200 px-2 py-1 rounded">yarn seed:models</code></p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([type, defs]) => {
        const meta = typeMetadata[type] || { 
          label: type, 
          colorClass: 'border-gray-400 bg-gray-50', 
          iconBg: 'bg-gray-700' 
        };
        
        return (
          <div key={type} className="space-y-4">
            {/* Group Header */}
            <div className="flex items-center gap-3 pb-2 border-b-2 border-gray-300">
              <div className={`w-10 h-10 rounded-full ${meta.iconBg} flex items-center justify-center text-white font-bold shadow-md`}>
                {defs.length}
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{meta.label}</h2>
            </div>

            {/* Credential Definition Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {defs.map(def => (
                <div 
                  key={def.credentialDefinitionId} 
                  className={`rounded-lg border-2 ${meta.colorClass} p-5 shadow-sm hover:shadow-lg transition-shadow duration-200`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 truncate" title={def.name}>
                        {def.name}
                      </h3>
                      <p className="text-sm text-gray-600">v{def.version}</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-300 ml-2">
                      {def.format}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-gray-700 min-w-[80px]">Schema:</span>
                      <span className="text-gray-600 break-all font-mono text-xs" title={def.schemaId}>
                        {def.schemaId.substring(0, 20)}...
                      </span>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-gray-700 min-w-[80px]">Issuer:</span>
                      <span className="text-gray-600 break-all font-mono text-xs" title={def.issuerDid}>
                        {def.issuerDid.substring(0, 25)}...
                      </span>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-gray-700 min-w-[80px]">Types:</span>
                      <div className="flex flex-wrap gap-1">
                        {def.credentialType.map((t, idx) => (
                          <span 
                            key={idx} 
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white text-gray-700 border border-gray-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Claims Preview */}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-primary-700 hover:text-primary-900 font-semibold text-xs">
                        View Claims Template ({Object.keys(def.claimsTemplate || {}).length} fields)
                      </summary>
                      <pre className="mt-2 p-3 bg-white rounded text-xs overflow-x-auto border border-gray-300 text-gray-800">
                        {JSON.stringify(def.claimsTemplate, null, 2)}
                      </pre>
                    </details>
                  </div>

                  {/* Footer Timestamp */}
                  <div className="mt-4 pt-3 border-t border-gray-300 text-xs text-gray-500">
                    Created: {new Date(def.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CredentialDefinitionList;
