import React from "react";
import Button from "@/components/walt/button/Button";
import BaseModal from "@/components/walt/modal/BaseModal";
import VCClaimsForm from "@/components/forms/VCClaimsForm";

type Props = {
  show: boolean;
  onClose: () => void;
  credentialSubject: any;
  setCredentialSubject: (credentialSubject: any) => void;
  credentialType?: string;
};

export default function EditCredentialModal({
  show,
  onClose,
  credentialSubject,
  setCredentialSubject,
  credentialType = 'GenericIDCredential',
}: Props) {
  const [localClaims, setLocalClaims] = React.useState<Record<string, any>>(
    typeof credentialSubject === 'object' ? credentialSubject : {}
  );
  const [showRawJson, setShowRawJson] = React.useState(false);
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  // Sync local claims when modal opens or credentialSubject changes
  React.useEffect(() => {
    if (show) {
      setLocalClaims(typeof credentialSubject === 'object' ? credentialSubject : {});
      setJsonError(null);
    }
  }, [show, credentialSubject]);

  const handleSave = () => {
    setCredentialSubject(localClaims);
    onClose();
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const parsed = JSON.parse(e.target.value);
      setLocalClaims(parsed);
      setJsonError(null);
    } catch (error) {
      setJsonError('Invalid JSON format');
    }
  };

  return (
    <BaseModal show={show} securedByWalt={false} onClose={onClose}>
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Edit Credential Claims
          </h2>
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="text-sm text-primary-600 hover:text-primary-800 underline"
          >
            {showRawJson ? 'Use Form View' : 'Edit Raw JSON'}
          </button>
        </div>

        {showRawJson ? (
          <div className="w-full">
            <textarea
              value={JSON.stringify(localClaims, null, 2)}
              onChange={handleJsonChange}
              className={`w-full h-64 border-2 rounded-md p-2 font-mono text-sm ${jsonError ? 'border-red-500' : 'border-gray-300'
                }`}
              placeholder="Paste your JSON here"
            />
            {jsonError && (
              <p className="text-red-500 text-sm mt-1">{jsonError}</p>
            )}
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto pr-2">
            <VCClaimsForm
              credentialType={credentialType}
              claims={localClaims}
              onChange={setLocalClaims}
            />
          </div>
        )}

        <div className="flex flex-row justify-end gap-2 mt-6 pt-4 border-t border-gray-200">
          <Button onClick={onClose} style="link">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            style="button"
            disabled={!!jsonError}
          >
            Save Claims
          </Button>
        </div>
      </div>
    </BaseModal>
  );
}
