import 'reflect-metadata'; // Must be first
import { Agent, KeyDidRegistrar, KeyDidResolver, DidsModule, CredentialsModule, HttpOutboundTransport, ConsoleLogger, LogLevel } from '@credo-ts/core';
import { OpenId4VcIssuerModule } from '@credo-ts/openid4vc';
import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar';
import { ariesAskar } from '@hyperledger/aries-askar-nodejs';
import { agentDependencies } from '@credo-ts/node';
import { DatabaseManager } from './src/persistence/DatabaseManager';

// Better Router mock
const Router = () => {
    const router = {
        get: () => router,
        post: () => router,
        use: () => router,
        param: () => router,
    };
    return router;
};

async function main() {
    const tenantId = process.argv[2] || '68f9c6ab-41cb-42f3-aa56-7913f7f95a71';
    console.log(`Syncing metadata for tenant: ${tenantId}`);

    // Initialize DB to read definitions
    DatabaseManager.initialize({ path: './data/persistence.db' });
    const { credentialDefinitionStore } = await import('./src/utils/credentialDefinitionStore');

    // Get ALL definitions for this tenant
    const defs = credentialDefinitionStore.list(tenantId);
    console.log(`Found ${defs.length} definitions in SQLite:`, defs.map(d => d.name).join(', '));

    if (defs.length === 0) {
        console.error('No definitions found! Run fix_tenant_defs.ts first.');
        process.exit(1);
    }

    // Build the correct credentials_supported list
    const credentialsSupported = defs.map(def => ({
        format: 'jwt_vc_json',
        id: `${def.name}_jwt_vc_json`,
        cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
        cryptographic_suites_supported: ['EdDSA', 'ES256'],
        types: def.credentialType || ['VerifiableCredential', def.name],
        display: [{ name: def.name, locale: 'en-US' }]
    }));

    // Helper to build modules
    const getModules = () => ({
        askar: new AskarModule({ ariesAskar, multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet }),
        dids: new DidsModule({ registrars: [new KeyDidRegistrar()], resolvers: [new KeyDidResolver()] }),
        credentials: new CredentialsModule({}),
        openId4VcIssuer: new OpenId4VcIssuerModule({
            baseUrl: 'http://mock-url',
            router: Router() as any,
            endpoints: { credential: {} } as any
        }),
    });

    const baseConfig = {
        label: 'Base Agent',
        walletConfig: { id: 'base-wallet-sync-script-4', key: 'base-key' },
        logger: new ConsoleLogger(LogLevel.info),
    };

    const agent = new Agent({
        config: baseConfig,
        modules: {
            ...getModules(),
            tenants: new (require('@credo-ts/tenants').TenantsModule)({ sessionAcquireTimeout: 10000 })
        },
        dependencies: agentDependencies
    });

    await agent.initialize();

    // Get Tenant Agent
    await (agent.modules as any).tenants.withTenantAgent({ tenantId }, async (tenantAgent: any) => {
        console.log(`Acquired tenant agent for ${tenantId}`);

        // Get existing issuer
        const issuers = await tenantAgent.modules.openId4VcIssuer.getAllIssuers();
        if (issuers.length === 0) {
            console.error('No issuer found for tenant! Provisioning might have failed completely.');
            return;
        }

        const issuer = issuers[0];
        console.log(`Found issuer ${issuer.issuerId}`);
        console.log('Current supported credentials (ids):', issuer.credentialsSupported.map((c: any) => c.id).join(', '));

        // Update metadata
        console.log('Updating issuer metadata...');
        await tenantAgent.modules.openId4VcIssuer.updateIssuerMetadata({
            issuerId: issuer.issuerId,
            credentialsSupported,
            display: issuer.display
        });

        console.log('SUCCESS: Issuer metadata updated.');

        // Verify
        const updatedIssuers = await tenantAgent.modules.openId4VcIssuer.getAllIssuers();
        const updated = updatedIssuers[0];
        console.log('New supported credentials (ids):', updated.credentialsSupported.map((c: any) => c.id).join(', '));
    });

    await agent.shutdown();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
