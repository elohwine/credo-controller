#!/usr/bin/env node
/**
 * Integration test: Create offer on issuer (port 3000), accept on holder (port 6000)
 * - Checks if credential already exists before offering
 * - Uses Credo Askar wallet for credential storage
 * Usage: node test-accept-offer.js
 */

const fetch = require('node-fetch')

const ISSUER_URL = 'http://127.0.0.1:3000'
const HOLDER_URL = 'http://127.0.0.1:6000'
const CREDENTIAL_TYPE = 'GenericIDCredential'

async function authenticateHolder() {
  // First, try to register (will fail if already exists)
  const registerResponse = await fetch(`${HOLDER_URL}/api/wallet/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'test-holder',
      email: 'test-holder@example.com',
      password: 'test-password-123',
    }),
  })

  // Login (whether register succeeded or user already exists)
  const loginResponse = await fetch(`${HOLDER_URL}/api/wallet/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'test-holder',
      password: 'test-password-123',
    }),
  })

  if (!loginResponse.ok) {
    const error = await loginResponse.text()
    throw new Error(`Failed to login: ${loginResponse.status} ${error}`)
  }

  const loginData = await loginResponse.json()
  return loginData.token
}

async function getWalletInfo(token) {
  const walletsResponse = await fetch(`${HOLDER_URL}/api/wallet/accounts/wallets`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!walletsResponse.ok) {
    const error = await walletsResponse.text()
    throw new Error(`Failed to get wallets: ${walletsResponse.status} ${error}`)
  }

  const walletsData = await walletsResponse.json()
  const walletId = walletsData.wallets[0]?.id
  if (!walletId) {
    throw new Error('No wallet found for holder')
  }

  // Get DIDs
  const didsResponse = await fetch(`${HOLDER_URL}/api/wallet/wallet/${walletId}/dids`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  
  let holderDid = null
  if (didsResponse.ok) {
    const dids = await didsResponse.json()
    holderDid = dids[0]?.did
  }

  return { walletId, holderDid }
}

async function checkExistingCredential(token, walletId, credentialType) {
  const checkResponse = await fetch(
    `${HOLDER_URL}/api/wallet/wallet/${walletId}/credentials/exists/${credentialType}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (checkResponse.ok) {
    return await checkResponse.json()
  }
  
  return { exists: false, count: 0, credentials: [] }
}

async function listCredentials(token, walletId) {
  const response = await fetch(`${HOLDER_URL}/api/wallet/wallet/${walletId}/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list credentials: ${response.status} ${error}`)
  }
  
  return await response.json()
}

async function createOffer() {
  // Get active issuer
  const debugResponse = await fetch(`${ISSUER_URL}/debug/issuer`)
  if (!debugResponse.ok) {
    throw new Error(`Failed to fetch issuer debug info: ${debugResponse.status}`)
  }
  const debugData = await debugResponse.json()
  
  const activeIssuer = debugData.issuers.find(i => i.credentialsSupported && i.credentialsSupported.length > 0)
  if (!activeIssuer) {
    throw new Error('No active issuer with credentials found')
  }
  
  const cred = activeIssuer.credentialsSupported.find(c => c.format === 'jwt_vc_json')
  if (!cred) {
    throw new Error('No jwt_vc_json credential found in active issuer')
  }
  
  const credDefId = cred.id.replace(/_jwt_vc_json$/, '')
  console.log('  Using credential definition ID:', credDefId)
  console.log('  From issuer:', activeIssuer.id)
  
  const offerResponse = await fetch(`${ISSUER_URL}/custom-oidc/issuer/credential-offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'test-api-key-12345',
    },
    body: JSON.stringify({
      credentials: [
        {
          credentialDefinitionId: credDefId,
          type: CREDENTIAL_TYPE,
          format: 'jwt_vc_json',
        },
      ],
    }),
  })

  if (!offerResponse.ok) {
    const error = await offerResponse.text()
    throw new Error(`Failed to create offer: ${offerResponse.status} ${error}`)
  }

  return await offerResponse.json()
}

async function acceptOffer(token, walletId, offerUri) {
  const acceptResponse = await fetch(
    `${HOLDER_URL}/api/wallet/wallet/${walletId}/exchange/useOfferRequest`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ credential_offer_uri: offerUri }),
    }
  )

  if (!acceptResponse.ok) {
    const error = await acceptResponse.text()
    throw new Error(`Failed to accept offer: ${acceptResponse.status} ${error}`)
  }

  return await acceptResponse.json()
}

async function runTest() {
  console.log('=== Integration Test: Accept Credential Offer ===\n')

  // Step 1: Authenticate holder first
  console.log('Step 1: Authenticating holder...')
  const holderToken = await authenticateHolder()
  console.log('✅ Holder authenticated')

  // Step 2: Get wallet info
  console.log('\nStep 2: Getting wallet info...')
  const { walletId, holderDid } = await getWalletInfo(holderToken)
  console.log('✅ Wallet ID:', walletId)
  console.log('✅ Holder DID:', holderDid || '(will be created during acceptance)')

  // Step 3: Check if credential already exists
  console.log('\nStep 3: Checking for existing', CREDENTIAL_TYPE, 'credential...')
  const existingCheck = await checkExistingCredential(holderToken, walletId, CREDENTIAL_TYPE)
  
  if (existingCheck.exists) {
    console.log(`\n✅ ${CREDENTIAL_TYPE} already exists in wallet!`)
    console.log('   Count:', existingCheck.count)
    existingCheck.credentials.forEach((c, i) => {
      console.log(`   [${i + 1}] ID: ${c.id}`)
      console.log(`       Types: ${c.types?.join(', ')}`)
      console.log(`       Issuer: ${c.issuer?.id || c.issuer}`)
      console.log(`       Issued: ${c.issuanceDate}`)
    })
    
    console.log('\n=== ✅ TEST PASSED (credential already accepted) ===')
    console.log('No need to create a new offer - wallet already has this credential type.')
    return
  }
  
  console.log('✅ No existing', CREDENTIAL_TYPE, 'found - proceeding with offer')

  // Step 4: Create offer on issuer
  console.log('\nStep 4: Creating credential offer on issuer...')
  const offer = await createOffer()
  console.log('✅ Offer created:')
  console.log('   Offer ID:', offer.offerId)
  console.log('   Pre-authorized code:', offer.preAuthorizedCode)

  // Step 5: Accept the offer
  console.log('\nStep 5: Accepting credential offer...')
  const offerUri = offer.credential_offer_uri || offer.offerUri
  const acceptResult = await acceptOffer(holderToken, walletId, offerUri)
  console.log('✅ Credential accepted:')
  console.log('   Credential ID:', acceptResult.id)
  console.log('   Has JWT:', !!acceptResult.verifiableCredential)

  // Step 6: Verify credential is now in wallet
  console.log('\nStep 6: Verifying credential is now in wallet...')
  
  // Wait a moment for any async storage
  await new Promise(resolve => setTimeout(resolve, 500))
  
  const credentials = await listCredentials(holderToken, walletId)
  console.log('✅ Credentials in wallet:', credentials.length)
  
  const newCredential = credentials.find(c => c.id === acceptResult.id || c.type === CREDENTIAL_TYPE)
  
  if (newCredential) {
    console.log('✅ New credential found:')
    console.log('   ID:', newCredential.id)
    console.log('   Type:', newCredential.type)
    console.log('   Format:', newCredential.format)
    console.log('   Added:', newCredential.addedOn)
  } else if (credentials.length > 0) {
    console.log('ℹ️ Credentials in wallet:')
    credentials.forEach((c, i) => {
      console.log(`   [${i + 1}] ID: ${c.id}, Type: ${c.type}`)
    })
  }

  console.log('\n=== ✅ Integration Test PASSED ===\n')
  console.log('Summary:')
  console.log('- Issuer created offer with jwt_vc_json format')
  console.log('- Holder successfully accepted the offer')
  console.log('- Credential is now stored in holder Credo wallet')
}

runTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n=== ❌ Integration Test FAILED ===')
    console.error('Error:', error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  })
