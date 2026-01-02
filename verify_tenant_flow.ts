
import axios from 'axios';

const backendUrl = 'http://localhost:3000';
const apiKey = 'test-api-key-12345'; // Matches fallback in _app.tsx

async function run() {
    try {
        console.log('1. Fetching root token...');
        const tokenRes = await axios.post(`${backendUrl}/agent/token`, {}, {
            headers: { 'Authorization': apiKey }
        });
        const rootToken = tokenRes.data.token;
        console.log('Root token obtained:', rootToken ? 'YES' : 'NO');

        console.log('2. Creating tenant...');
        const createRes = await axios.post(`${backendUrl}/multi-tenancy/create-tenant`,
            {
                config: {
                    label: 'Verification Tenant',
                    tenantType: 'ORG'
                },
                baseUrl: backendUrl // Added required field
            },
            { headers: { 'Authorization': `Bearer ${rootToken}` } }
        );
        console.log('Tenant created:', createRes.data.tenantId);
        console.log('Tenant token obtained:', createRes.data.token ? 'YES' : 'NO');

        console.log('3. Fetching OIDC Metadata...');
        const metaUrl = `${backendUrl}/tenants/${createRes.data.tenantId}/.well-known/openid-credential-issuer`;
        const metaRes = await axios.get(metaUrl);
        console.log('OIDC Metadata obtained. Supported Configs:');
        console.log(Object.keys(metaRes.data.credential_configurations_supported || {}));

    } catch (error: any) {
        console.error('Flow failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data));
        }
    }
}

run();
