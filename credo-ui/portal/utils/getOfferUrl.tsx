import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { AvailableCredential, CredentialFormats, DIDMethods, DIDMethodsConfig } from "@/types/credentials";

const getOfferUrl = async (
  credentials: Array<AvailableCredential>,
  NEXT_PUBLIC_VC_REPO: string,
  NEXT_PUBLIC_ISSUER: string,
  authenticationMethod?: string,
  vpRequestValue?: string,
  vpProfile?: string
) => {
  // Resolve tenant id (prefer runtime/localStorage over env fallback)
  const runtimeTenantId =
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('tenantId') || window.localStorage.getItem('credoTenantId'))
      : undefined;
  const tenantId = runtimeTenantId || process.env.NEXT_PUBLIC_TENANT_ID || 'default';
  console.log('Resolved tenantId:', tenantId, 'from runtime:', runtimeTenantId, 'env:', process.env.NEXT_PUBLIC_TENANT_ID);
  
  if (!tenantId || tenantId === 'default') {
    throw new Error('No valid tenant ID found. Please refresh the page to initialize tenant authentication.');
  }

  // Fetch OpenID issuer metadata from Credo backend (fail safe)
  let data: any = {};
  try {
    const metadataUrl = `${NEXT_PUBLIC_ISSUER.replace("/oidc/issuer", "")}/tenants/${tenantId}/.well-known/openid-credential-issuer`;
    console.log('Fetching metadata from:', metadataUrl);
    const resp = await fetch(metadataUrl);
    data = await resp.json();
    console.log('Metadata response:', data);
  } catch (e: any) {
    console.warn("Failed to fetch issuer metadata", e?.message);
    data = {};
  }
  const credential_configurations_supported: Record<string, any> =
    data?.credential_configurations_supported || {};

  const payload = await Promise.all(
    credentials.map(async (c) => {
      c = {
        ...c,
        selectedFormat: c.selectedFormat ?? CredentialFormats[0],
        selectedDID: c.selectedDID ?? DIDMethods[0],
      };

      const offer = { ...c.offer, id: uuidv4() };
      let payload: {
        issuerDid: string;
        issuerKey: { type: string; jwk: object };
        credentialConfigurationId: string;
        credentialData: any;
        mapping?: any;
        selectiveDisclosure?: any;
        authenticationMethod?: string;
        vpRequestValue?: string;
        vpProfile?: string;
      } = {
        issuerDid:
          data?.issuerDid ||
          DIDMethodsConfig[c.selectedDID as keyof typeof DIDMethodsConfig]
            .issuerDid,
        issuerKey:
          DIDMethodsConfig[c.selectedDID as keyof typeof DIDMethodsConfig]
            .issuerKey,
        credentialConfigurationId:
          Object.keys(credential_configurations_supported).find(
            (key) => key === c.id + "_jwt_vc_json"
          ) || c.id + "_jwt_vc_json",
        credentialData: offer,
      };

      if (c.selectedFormat === 'SD-JWT + IETF SD-JWT VC') {
        payload.mapping = {
          id: '<uuid>',
          iat: '<timestamp-seconds>',
          nbf: '<timestamp-seconds>',
          exp: '<timestamp-in-seconds:365d>',
        };

        // Hack - remove the following fields as they used for w3c only
        delete payload.credentialData['@context'];
        delete payload.credentialData['type'];
        delete payload.credentialData['validFrom'];
        delete payload.credentialData['expirationDate'];
        delete payload.credentialData['issuanceDate'];
        delete payload.credentialData['issued'];
        delete payload.credentialData['issuer'];

        payload.credentialConfigurationId =
          Object.keys(credential_configurations_supported).find(
            (key) => key === c.id + "_vc+sd-jwt"
          ) || c.id + "_vc+sd-jwt";
        payload.selectiveDisclosure = { fields: {} };
        for (const key in offer.credentialSubject) {
          if (typeof offer.credentialSubject[key] === 'string') {
            payload.selectiveDisclosure.fields[key] = {
              sd: true,
            };
          }
        }
      } else {
        // Skip mapping fetch for Credo backend - claimsTemplate is already provided
        payload.mapping = null;

        if (c.selectedFormat === 'SD-JWT + W3C VC') {
          payload.selectiveDisclosure = {
            fields: {
              credentialSubject: {
                sd: false,
                children: {
                  fields: {},
                },
              },
            },
          };
          for (const key in offer.credentialSubject) {
            if (typeof offer.credentialSubject[key] === 'string' || typeof offer.credentialSubject[key] === 'boolean') {
              payload.selectiveDisclosure.fields.credentialSubject.children.fields[
                key
              ] = {
                sd: true,
              };
            }
          }
        }
      }

      if (authenticationMethod) {
        payload.authenticationMethod = authenticationMethod;
      }
      if (vpRequestValue) {
        payload.vpRequestValue = vpRequestValue;
      }
      if (vpProfile) {
        payload.vpProfile = vpProfile;
      }

      if (c.selectedFormat === 'SD-JWT + IETF SD-JWT VC') {
        const { credentialSubject, ...restOfCredentialData } =
          payload.credentialData; // Destructure credentialSubject and the rest
        return {
          ...payload, // Keep the rest of the payload unchanged
          credentialData: {
            ...restOfCredentialData, // Spread other fields from credentialData (e.g., id, issuer)
            ...credentialSubject, // Spread fields from credentialSubject to the top level of credentialData
          },
        };
      } else {
        return payload;
      }
    })
  );

  // Use Credo backend credential offer endpoint
  const issueUrl = `${NEXT_PUBLIC_ISSUER.replace('/oidc/issuer', '')}/oidc/issuer/credential-offers`;
  
  // Transform payload to match Credo backend format
  // Map each credential to the OfferCredentialTemplate structure
  const credoPayload = {
    credentials: credentials.map((c) => {
      // Use the actual credentialDefinitionId from the backend (UUID)
      const credDefId = c.credentialDefinitionId || c.id;
      
      return {
        credentialDefinitionId: credDefId,
        type: c.offer?.type || ['VerifiableCredential'],
        format: (c.selectedFormat === 'SD-JWT + IETF SD-JWT VC' ? 'sd_jwt' : 'jwt_vc') as 'jwt_vc' | 'sd_jwt',
        claimsTemplate: {
          credentialSubject: c.offer?.credentialSubject || {}
        },
        issuerDid: c.issuerDid || data?.issuerDid || DIDMethodsConfig[c.selectedDID as keyof typeof DIDMethodsConfig]?.issuerDid
      };
    }),
    issuerDid: credentials[0]?.issuerDid || data?.issuerDid || DIDMethodsConfig[credentials[0]?.selectedDID as keyof typeof DIDMethodsConfig]?.issuerDid
  };
  
  console.log('Sending credential offer payload:', JSON.stringify(credoPayload, null, 2));
  
  // Resolve tenant token (localStorage preferred)
  const runtimeTenantToken =
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('tenantToken') || window.localStorage.getItem('credoTenantToken'))
      : undefined;
  const tenantToken = runtimeTenantToken || process.env.NEXT_PUBLIC_TENANT_TOKEN || '';
  if (!tenantToken) {
    throw new Error('Missing tenant token (NEXT_PUBLIC_TENANT_TOKEN or localStorage tenantToken). Cannot create credential offer.');
  }

  return axios.post(issueUrl, credoPayload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tenantToken}`,
      'X-Tenant-ID': tenantId
    }
  });
};

export { getOfferUrl };
