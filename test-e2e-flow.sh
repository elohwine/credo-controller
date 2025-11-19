#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
API_KEY="test-api-key-12345"

echo "=== Credo Controller E2E Test ==="
echo

# 1. Get root token
echo "1. Getting root token..."
ROOT_TOKEN=$(curl -s -X POST "$BASE_URL/agent/token" \
  -H "Authorization: $API_KEY" | jq -r '.token')
echo "Root token: ${ROOT_TOKEN:0:20}..."
echo

# 2. Create tenant
echo "2. Creating tenant..."
TENANT_RESPONSE=$(curl -s -X POST "$BASE_URL/multi-tenancy/create-tenant" \
  -H "Authorization: Bearer $ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"'"$BASE_URL"'","displayName":"Test Tenant","config":{"label":"Test Tenant"}}')

TENANT_ID=$(echo "$TENANT_RESPONSE" | jq -r '.tenantId')
TENANT_TOKEN=$(echo "$TENANT_RESPONSE" | jq -r '.token')
ISSUER_DID=$(echo "$TENANT_RESPONSE" | jq -r '.issuerDid')

echo "Tenant ID: $TENANT_ID"
echo "Issuer DID: $ISSUER_DID"
echo "Tenant token: ${TENANT_TOKEN:0:20}..."
echo

# 3. Register schema
echo "3. Registering schema..."
SCHEMA_RESPONSE=$(curl -s -X POST "$BASE_URL/oidc/schemas" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"UniversityDegree",
    "version":"1.0",
    "jsonSchema":{
      "type":"object",
      "properties":{
        "degree":{"type":"string"},
        "university":{"type":"string"},
        "graduationDate":{"type":"string","format":"date"}
      },
      "required":["degree","university"]
    }
  }')

SCHEMA_ID=$(echo "$SCHEMA_RESPONSE" | jq -r '.schemaId')
echo "Schema ID: $SCHEMA_ID"
echo

# 4. Register credential definition
echo "4. Registering credential definition..."
CRED_DEF_RESPONSE=$(curl -s -X POST "$BASE_URL/oidc/credential-definitions/" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"UniversityDegreeCredential",
    "version":"1.0",
    "schemaId":"'"$SCHEMA_ID"'",
    "issuerDid":"'"$ISSUER_DID"'",
    "credentialType":["VerifiableCredential","UniversityDegreeCredential"],
    "claimsTemplate":{
      "degree":"Bachelor of Science",
      "university":"Example University",
      "graduationDate":"2024-06-15"
    },
    "format":"jwt_vc"
  }')

CRED_DEF_ID=$(echo "$CRED_DEF_RESPONSE" | jq -r '.credentialDefinitionId')
echo "Credential Definition ID: $CRED_DEF_ID"
echo

# 5. Get metadata
echo "5. Fetching tenant OIDC metadata..."
curl -s "$BASE_URL/oidc/metadata/issuer" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" | jq '.credential_configurations_supported | keys'
echo

# 6. Create credential offer
echo "6. Creating credential offer..."
OFFER_RESPONSE=$(curl -s -X POST "$BASE_URL/oidc/issuer/credential-offers" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials":[{
      "credentialDefinitionId":"'"$CRED_DEF_ID"'",
      "format":"jwt_vc",
      "type":["VerifiableCredential","UniversityDegreeCredential"],
      "issuerDid":"'"$ISSUER_DID"'",
      "claimsTemplate":{
        "degree":"Masters of Computer Science",
        "university":"Elite University",
        "graduationDate":"2025-12-20"
      }
    }]
  }')

OFFER_URL=$(echo "$OFFER_RESPONSE" | jq -r '.credential_offer_url')
PRE_AUTH_CODE=$(echo "$OFFER_RESPONSE" | jq -r '.preAuthorizedCode')

echo "Offer URL: $OFFER_URL"
echo "Pre-auth code: ${PRE_AUTH_CODE:0:20}..."
echo

echo "=== Test complete! ==="
echo "Tenant: $TENANT_ID"
echo "Schema: $SCHEMA_ID"
echo "Cred Def: $CRED_DEF_ID"
echo "Offer ready for wallet scanning"
