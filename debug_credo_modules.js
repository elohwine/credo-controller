
const { Agent } = require('@credo-ts/core')
const { OpenId4VcHolderModule } = require('@credo-ts/openid4vc')
const { agentDependencies } = require('@credo-ts/node')

console.log('OpenId4VcHolderModule defaults:', new OpenId4VcHolderModule().config)
console.log('OpenId4VcHolderModule keys:', Object.keys(new OpenId4VcHolderModule()))
