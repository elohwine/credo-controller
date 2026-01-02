/**
 * Manual seed script to register credential models for a specific tenant.
 * Usage: npx ts-node seed_tenant_models.ts <tenantId> <issuerDid>
 */
import { DatabaseManager } from './src/persistence/DatabaseManager';

async function main() {
    const tenantId = process.argv[2] || '353dacc9-6a3e-430a-8d0c-4615a5c705b6';
    const issuerDid = process.argv[3] || 'did:key:z6MktJqT7wXcH3KLzbXxXMWDZL7s35uKFD3csTmRuvFyJCjn';

    console.log(`Seeding models for tenant: ${tenantId}`);
    console.log(`Using issuerDid: ${issuerDid}`);

    // Initialize DB
    DatabaseManager.initialize({ path: './data/persistence.db' });

    const { schemaStore } = await import('./src/utils/schemaStore');
    const { credentialDefinitionStore } = await import('./src/utils/credentialDefinitionStore');

    const ensureSchema = (name: string, version: string, jsonSchema: Record<string, any>) => {
        const existing = schemaStore.find(name, version, tenantId);
        if (existing) {
            console.log(`  Schema ${name} already exists`);
            return existing.schemaId;
        }
        const res: any = schemaStore.register({ name, version, jsonSchema, tenantId });
        if ('error' in res) throw new Error(res.error);
        console.log(`  Registered schema: ${name}`);
        return res.schemaId;
    };

    const registerDef = (name: string, version: string, schemaId: string, credentialType: string[], format: string = 'jwt_vc_json') => {
        const existing = credentialDefinitionStore.list(tenantId).find((d: any) => d.name === name);
        if (existing) {
            console.log(`  CredDef ${name} already exists`);
            return;
        }
        const res: any = credentialDefinitionStore.register({
            name,
            version,
            schemaId,
            issuerDid,
            credentialType,
            claimsTemplate: {},
            format: format as any,
            tenantId,
        });
        if ('error' in res) throw new Error(res.error);
        console.log(`  Registered CredDef: ${name}`);
    };

    // Register all models
    const cartSchemaId = ensureSchema('CartSnapshotVC', '1.0.0', { $id: 'CartSnapshotVC-1.0.0', type: 'object' });
    const invoiceSchemaId = ensureSchema('InvoiceVC', '1.0.0', { $id: 'InvoiceVC-1.0.0', type: 'object' });
    const receiptSchemaId = ensureSchema('ReceiptVC', '1.0.0', { $id: 'ReceiptVC-1.0.0', type: 'object' });
    const ehrSchemaId = ensureSchema('EHRSummary', '1.0.0', { $id: 'EHRSummary-1.0.0', type: 'object' });
    const badgeSchemaId = ensureSchema('OpenBadge', '3.0.0', { $id: 'OpenBadge-3.0.0', type: 'object' });
    const mdocSchemaId = ensureSchema('MdocHealthSummary', '0.1.0', { $id: 'MdocHealthSummary-0.1.0', type: 'object' });
    const paymentSchemaId = ensureSchema('PaymentReceipt', '1.0.0', { $id: 'PaymentReceipt-1.0.0', type: 'object' });
    const genericIdSchemaId = ensureSchema('GenericIDCredential', '1.0.0', { $id: 'GenericIDCredential-1.0.0', type: 'object' });

    registerDef('CartSnapshotVC', '1.0.0', cartSchemaId, ['VerifiableCredential', 'CartSnapshotVC']);
    registerDef('InvoiceVC', '1.0.0', invoiceSchemaId, ['VerifiableCredential', 'InvoiceVC']);
    registerDef('ReceiptVC', '1.0.0', receiptSchemaId, ['VerifiableCredential', 'ReceiptVC']);
    registerDef('EHRSummary', '1.0.0', ehrSchemaId, ['VerifiableCredential', 'EHRSummary']);
    registerDef('OpenBadge', '3.0.0', badgeSchemaId, ['VerifiableCredential', 'OpenBadgeCredential']);
    registerDef('MdocHealthSummary', '0.1.0', mdocSchemaId, ['VerifiableCredential', 'MdocHealthSummary']);
    registerDef('PaymentReceipt', '1.0.0', paymentSchemaId, ['VerifiableCredential', 'PaymentReceipt']);
    registerDef('GenericIDCredential', '1.0.0', genericIdSchemaId, ['VerifiableCredential', 'GenericIDCredential']);

    console.log('\nDone! Credential definitions seeded for tenant.');
    console.log('Verify by refreshing the Portal page.');
}

main().catch(console.error);
