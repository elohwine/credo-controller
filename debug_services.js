
const { Agent, CredentialsModule, W3cCredentialsModule } = require('@credo-ts/core')
const { agentDependencies } = require('@credo-ts/node')
const { AskarModule } = require('@credo-ts/askar')
const { ariesAskar } = require('@hyperledger/aries-askar-nodejs')
const { OpenId4VcHolderModule } = require('@credo-ts/openid4vc')

async function run() {
    const agent = new Agent({
        config: {
            label: 'test',
            walletConfig: { id: 'test', key: 'test' },
            logger: { log: () => { } }
        },
        modules: {
            askar: new AskarModule({ ariesAskar }),
            credentials: new CredentialsModule(),
            w3cCredentials: new W3cCredentialsModule(),
            openId4VcHolder: new OpenId4VcHolderModule(),
        },
        dependencies: agentDependencies
    })

    await agent.initialize()

    const services = agent.modules.credentials.getFormatServices()
    console.log('Format Services:', services.map(s => ({ key: s.formatKey, supports: s.supportsFormat })))

    // Clean up
    await agent.shutdown()
    await agent.wallet.delete()
}

run().catch(console.error)
