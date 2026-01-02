/**
 * Fix stale credential definitions for a specific tenant
 * Deletes all existing definitions and re-registers with correct names
 */
import { DatabaseManager } from './src/persistence/DatabaseManager';

async function main() {
    const tenantId = process.argv[2] || '68f9c6ab-41cb-42f3-aa56-7913f7f95a71';
    const issuerDid = process.argv[3] || 'did:key:z6MkkNFzHNbKXNr49co6H6rhRG4sgYcsssBvhTbFtctXhh5w';

    console.log(`Fixing definitions for tenant: ${tenantId}`);

    DatabaseManager.initialize({ path: './data/persistence.db' });
    const db = DatabaseManager.getDatabase();

    // Delete existing definitions for this tenant
    const deleteResult = db.prepare('DELETE FROM credential_definitions WHERE tenant_id = ?').run(tenantId);
    console.log(`Deleted ${deleteResult.changes} stale credential definitions`);

    const deleteSchemas = db.prepare('DELETE FROM json_schemas WHERE tenant_id = ?').run(tenantId);
    console.log(`Deleted ${deleteSchemas.changes} stale schemas`);

    // Now re-seed with correct names
    const { schemaStore } = await import('./src/utils/schemaStore');
    const { credentialDefinitionStore } = await import('./src/utils/credentialDefinitionStore');

    const ensureSchema = (name: string, version: string, jsonSchema: Record<string, any>) => {
        const res: any = schemaStore.register({ name, version, jsonSchema, tenantId });
        if ('error' in res) { console.log(`Schema ${name} already exists`); return res.schemaId; }
        console.log(`  Registered schema: ${name}`);
        return res.schemaId;
    };

    const registerDef = (name: string, version: string, schemaId: string, credentialType: string[]) => {
        const res: any = credentialDefinitionStore.register({
            name,
            version,
            schemaId,
            issuerDid,
            credentialType,
            claimsTemplate: {},
            format: 'jwt_vc_json' as any,
            tenantId,
        });
        if ('error' in res) { console.log(`CredDef ${name} error: ${res.error}`); return; }
        console.log(`  Registered CredDef: ${name}`);
    };

    // Register all models with CORRECT names (no 'Def' suffix)
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

    console.log('\nDone! Restart the server for changes to take effect.');
}

main().catch(console.error);
