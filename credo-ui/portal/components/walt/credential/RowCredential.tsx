import { AvailableCredential, CredentialFormats, DIDMethods } from "@/types/credentials";
import EditCredentialModal from "../modal/EditCredentialModal";
import { ActionIcon, Box, Group, Text } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import Dropdown from "@/components/walt/forms/Dropdown";
import React from "react";

type Props = {
  credentialToEdit: AvailableCredential;
  credentialsToIssue: AvailableCredential[];
  setCredentialsToIssue: (credentials: AvailableCredential[]) => void;
};

export default function RowCredential({
  credentialToEdit,
  credentialsToIssue,
  setCredentialsToIssue,
}: Props) {
  const [credentialSubject, setCredentialSubject] = React.useState(
    credentialToEdit.offer.credentialSubject || {}
  );
  const [selectedFormat, setSelectedFormat] = React.useState(
    CredentialFormats[0]
  );
  const [selectedDID, setSelectedDID] = React.useState(DIDMethods[0]);
  const [modalVisible, setModalVisible] = React.useState(false);

  // Extract credential type from title or id
  const credentialType = credentialToEdit.title?.replace(/\s+/g, '') ||
    credentialToEdit.id?.split('_')[0] ||
    'GenericIDCredential';

  React.useEffect(() => {
    setCredentialsToIssue(
      credentialsToIssue.map((credential) => {
        if (credential.offer.id == credentialToEdit.offer.id) {
          let updatedCredential = { ...credential };

          if (credentialSubject !== credential.offer.credentialSubject) {
            updatedCredential.offer.credentialSubject = credentialSubject;
          }
          updatedCredential.selectedFormat = selectedFormat;
          updatedCredential.selectedDID = selectedDID;

          return updatedCredential;
        } else {
          let updatedCredential = { ...credential };
          updatedCredential.selectedFormat = selectedFormat;
          return updatedCredential;
        }
      })
    );
  }, [credentialSubject, selectedFormat, selectedDID]);

  return (
    <>
      <Group justify="space-between" gap="md" align="center">
        <Group gap="md" wrap="nowrap">
          <Box
            visibleFrom="sm"
            w={45}
            h={28}
            bg="var(--mantine-primary-color-light)"
            style={{ borderRadius: 'var(--mantine-radius-md)', flexShrink: 0 }}
          />
          <Text size="lg" ta="left">
            {credentialToEdit.title}
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Edit ${credentialToEdit.title}`}
            onClick={() => {
              setModalVisible(true);
            }}
          >
            <IconPencil size={16} />
          </ActionIcon>
        </Group>
        <Group gap="sm" wrap="nowrap" w={{ base: '100%', lg: '42%' }}>
          <Box flex={1}>
            <Dropdown
              values={CredentialFormats}
              selected={selectedFormat}
              setSelected={setSelectedFormat}
            />
          </Box>
          <Box flex={1}>
            <Dropdown
              values={DIDMethods}
              selected={selectedDID}
              setSelected={setSelectedDID}
            />
          </Box>
        </Group>
      </Group>
      <EditCredentialModal
        show={modalVisible}
        onClose={() => {
          setModalVisible(false);
        }}
        credentialSubject={credentialSubject}
        setCredentialSubject={setCredentialSubject}
        credentialType={credentialType}
      />
    </>
  );
}
