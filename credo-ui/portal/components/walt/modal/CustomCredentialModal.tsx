import BaseModal from "@/components/walt/modal/BaseModal";
import {CredentialsContext} from "@/pages/_app";
import Button from "../button/Button";
import React, {useState} from "react";
import { Group, Stack, Textarea } from "@mantine/core";

type Props = {
  show: boolean;
  onClose: () => void;
};

export default function EditCredentialModal({ show, onClose }: Props) {
  const [AvailableCredentials, setAvailableCredentials] =
    React.useContext(CredentialsContext);
  const [credentialJson, setCredentialJson] = useState();
  function getType(credential: any | undefined): string {
    let type = 'undefined';
    if (credential) {
      type = credential!.type[credential!.type!.length - 1];
      console.log(credential);
      console.log(type);
    }
    return type;
  }

  return (
    <BaseModal show={show} securedByWalt={false} onClose={onClose}>
      <Stack gap="lg">
        <Textarea
            aria-label="Record JSON"
            rows={8}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            value={JSON.stringify(credentialJson)}
            onChange={(e) => {
              try {
                setCredentialJson(JSON.parse(e.target.value));
              } catch (error) {
                console.log(error);
              }
            }}
            placeholder="Paste your JSON here"
        />
        <Group justify="flex-end" gap="xs">
          <Button onClick={onClose} style="link">
            Cancel
          </Button>
          <Button
            onClick={() => {
              setAvailableCredentials([
                {
                  id: getType(credentialJson),
                  title: getType(credentialJson)
                    .replace(/([A-Z])/g, ' $1')
                    .trim(),
                  offer: credentialJson ? credentialJson : {},
                },
                ...AvailableCredentials,
              ]);
              setCredentialJson(undefined);
              onClose();
            }}
            style="button"
          >
            Save
          </Button>
        </Group>
      </Stack>
    </BaseModal>
  );
}
