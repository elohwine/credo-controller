import 'reflect-metadata'
import { DatabaseManager } from './src/persistence/DatabaseManager'
import { workflowRepository } from './src/persistence/WorkflowRepository'

async function checkWorkflows() {
    DatabaseManager.initialize({ path: './data/persistence.db' })
    console.log('Checking workflows in database...')

    const workflows = workflowRepository.list()
    console.log(`Found ${workflows.length} workflows:`)
    workflows.forEach(w => {
        console.log(`- [${w.tenantId}] ${w.id}: ${w.name} (${w.category})`)
    })

    DatabaseManager.close()
}

checkWorkflows().catch(console.error)
