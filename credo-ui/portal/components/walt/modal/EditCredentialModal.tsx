import React from "react";
import Button from "@/components/walt/button/Button";
import BaseModal from "@/components/walt/modal/BaseModal";
import VCClaimsForm from "@/components/forms/VCClaimsForm";
import { Anchor, Group, ScrollArea, Stack, Textarea, Title } from "@mantine/core";

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
    <BaseModal show={show} securedByWalt={false} onClose={onClose} size="lg">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2} size="h4">
            Edit record details
          </Title>
          <Anchor component="button" type="button" size="sm" onClick={() => setShowRawJson(!showRawJson)}>
            {showRawJson ? 'Use Form View' : 'Edit Raw JSON'}
          </Anchor>
        </Group>

        {showRawJson ? (
          <Textarea
            aria-label="Record JSON"
            value={JSON.stringify(localClaims, null, 2)}
            onChange={handleJsonChange}
            rows={12}
            error={jsonError}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-sm)' } }}
            placeholder="Paste your JSON here"
          />
        ) : (
          <ScrollArea.Autosize mah={400} offsetScrollbars>
            <VCClaimsForm
              credentialType={credentialType}
              claims={localClaims}
              onChange={setLocalClaims}
            />
          </ScrollArea.Autosize>
        )}

        <Group
          justify="flex-end"
          gap="xs"
          pt="md"
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          <Button onClick={onClose} style="link">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            style="button"
            disabled={!!jsonError}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </BaseModal>
  );
}
