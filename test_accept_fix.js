const axios = require('axios'); // Wait, check if axios is installed in root... fallback to fetch if needed.

// Using built-in fetch for Node 18+
const BASE_URL = 'http://localhost:3000';
const API_KEY = 'test-api-key-12345'; // Default from _app.tsx
const OFFER_URI = process.argv[2] || 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2F172.19.0.10%3A3000%2Foidc%2Fissuer%2Fdefault-platform-issuer%2Foffers%2F94f66c89-dbdd-4efe-8fee-bb20b22186c0';

async function main() {
  try {
    console.log('[1] Getting root token...');
    const rootRes = await fetch(`${BASE_URL}/agent/token`, {
      method: 'POST',
      headers: { 'Authorization': API_KEY }
    });
    if (!rootRes.ok) throw new Error(`Root token failed: ${await rootRes.text()}`);
    const { token: rootToken } = await rootRes.json();
    console.log('Root token obtained.');

    console.log('[2] Creating/Getting tenant...');
    // We'll just create a new one to be sure
    const tenantRes = await fetch(`${BASE_URL}/multi-tenancy/create-tenant`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${rootToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        config: { label: `Test-Tenant-${Date.now()}`, tenantType: 'USER' }
      })
    });
    
    // If it fails, maybe duplicate? No, label is unique-ish.
    if (!tenantRes.ok) throw new Error(`Create tenant failed: ${await tenantRes.text()}`);
    const tenant = await tenantRes.json();
    const tenantToken = tenant.token; // usually returned
    console.log(`Tenant created: ${tenant.id}`);

    console.log('[3] Accepting Offer...');
    console.log(`Sending Offer: ${OFFER_URI}`);
    
    const acceptRes = await fetch(`${BASE_URL}/api/wallet/credentials/accept-offer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ offerUri: OFFER_URI })
    });
    
    const status = acceptRes.status;
    const text = await acceptRes.text();
    console.log(`Response Status: ${status}`);
    console.log(`Response Body: ${text}`);

    if (status !== 201 && status !== 200) {
      process.exit(1);
    }

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();