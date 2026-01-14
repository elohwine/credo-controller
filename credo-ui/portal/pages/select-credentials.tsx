import React, { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Credential from "@/components/walt/credential/Credential";
import { AvailableCredential } from "@/types/credentials";
import Button from "@/components/walt/button/Button";
import { CredentialsContext, EnvContext } from "@/pages/_app";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import axios from "axios";
import { ensurePortalTenant } from "@/utils/portalTenant";

type CredentialToIssue = AvailableCredential & {
  selected: boolean;
};

export default function SelectCredentials() {
  const [AvailableCredentials] = React.useContext(CredentialsContext);
  const env = React.useContext(EnvContext);
  const router = useRouter();

  const [definitionTypeById, setDefinitionTypeById] = useState<Record<string, string>>({});

  const [credentialsToIssue, setCredentialsToIssue] = useState<CredentialToIssue[]>(
    prepareCredentialsToIssue
  );
  const [searchTerm, setSearchTerm] = useState<string>("");

  const showButton = credentialsToIssue.some((cred) => cred.selected);

  function prepareCredentialsToIssue(): CredentialToIssue[] {
    return AvailableCredentials.map((cred: AvailableCredential) => {
      return {
        ...cred,
        selected: false,
      };
    });
  }

  React.useEffect(() => {
    setCredentialsToIssue(prepareCredentialsToIssue());
  }, [AvailableCredentials]);

  React.useEffect(() => {
    const loadDefinitions = async () => {
      const credoBackend = env?.NEXT_PUBLIC_VC_REPO;
      if (!credoBackend) return;

      try {
        const { tenantToken } = await ensurePortalTenant(credoBackend);
        const resp = await axios.get(`${credoBackend}/oidc/credential-definitions`, {
          headers: { Authorization: `Bearer ${tenantToken}` },
        });

        const defs: any[] = Array.isArray(resp.data) ? resp.data : [];
        const map: Record<string, string> = {};

        for (const def of defs) {
          const typeKey =
            Array.isArray(def?.credentialType) && def.credentialType.length
              ? def.credentialType[def.credentialType.length - 1]
              : undefined;
          if (!typeKey) continue;

          if (def?.credentialDefinitionId) map[String(def.credentialDefinitionId)] = String(typeKey);
          if (def?.name) map[String(def.name)] = String(typeKey);
        }

        setDefinitionTypeById(map);
      } catch {
        console.warn('[select-credentials] Failed to load credential definitions for grouping');
      }
    };

    loadDefinitions();
  }, [env?.NEXT_PUBLIC_VC_REPO]);

  const groupedCredentials = useMemo(() => {
    const groups: Record<string, CredentialToIssue[]> = {};

    const filtered = !searchTerm
      ? credentialsToIssue
      : credentialsToIssue.filter((credential) =>
          credential.title.toLowerCase().includes(searchTerm.toLowerCase())
        );

    for (const cred of filtered) {
      const typeKey = definitionTypeById[cred.id] || definitionTypeById[cred.title] || 'Other';
      if (!groups[typeKey]) groups[typeKey] = [];
      groups[typeKey].push(cred);
    }

    const ordered: Record<string, CredentialToIssue[]> = {};
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
    for (const k of keys) ordered[k] = groups[k];
    return ordered;
  }, [credentialsToIssue, definitionTypeById, searchTerm]);

  const totalVisible = Object.values(groupedCredentials).reduce((sum, arr) => sum + arr.length, 0);

  function getIdsForCredentialsToIssue() {
    const ids: string[] = [];
    credentialsToIssue.forEach((cred) => {
      if (cred.selected) {
        ids.push(cred.id);
      }
    });

    return ids;
  }

  function handleCredentialSelect(id: string) {
    const updatedCreds = credentialsToIssue.map((cred) => {
      if (cred.id === id) {
        return {
          ...cred,
          selected: !cred.selected,
        };
      } else {
        return cred;
      }
    });

    setCredentialsToIssue(updatedCreds);
  }

  function handleStartIssuance() {
    const idsToIssue = getIdsForCredentialsToIssue();

    const params = new URLSearchParams();
    params.append("ids", idsToIssue.join(","));

    router.push(`/credentials?${params.toString()}`);
  }

  function handleSearchTermChange(e: any) {
    const value = e.target.value;
    setSearchTerm(value);
  }

  return (
    <Layout title="Select Credentials">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col justify-center items-center mb-10">
          <h1 className="text-4xl font-bold text-center mt-5" style={{ color: "#0A3D5C" }}>
            Select Credentials
          </h1>
          <p className="mt-4 text-lg" style={{ color: "#2188CA" }}>
            Choose credential(s) to issue or verify
          </p>
        </div>

        <main className="flex flex-col items-center gap-5 justify-between">
          <div className="flex flex-row gap-5 w-full max-w-3xl px-5">
            <div className="flex flex-row w-full border-b border-b-1 border-gray-200 bg-white rounded-t-lg">
              <MagnifyingGlassIcon className="h-6 mt-3 ml-3 text-gray-500" />
              <input
                type="text"
                placeholder="Search credentials..."
                className="w-full mt-1 px-3 border-none outline-none focus:ring-0 bg-white"
                onChange={handleSearchTermChange}
              />
            </div>
            {showButton && (
              <div className="shrink-0">
                <Button size="lg" onClick={handleStartIssuance}>
                  Continue
                </Button>
              </div>
            )}
          </div>

          {totalVisible === 0 && (
            <div className="w-full mt-10 text-center">
              <p className="text-gray-500">No credentials found matching "{searchTerm}"</p>
            </div>
          )}

          <div className="w-full max-w-3xl mt-10 space-y-10">
            {Object.entries(groupedCredentials).map(([typeKey, items]) => (
              <div key={typeKey} className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <h2 className="text-lg font-semibold text-gray-900">{typeKey}</h2>
                  <span className="text-sm text-gray-500">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-10 gap-x-5">
                  {items.map(({ id, title, selected }) => (
                    <Credential
                      id={id}
                      title={title}
                      selected={selected}
                      onClick={handleCredentialSelect}
                      key={id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </Layout>
  );
}
