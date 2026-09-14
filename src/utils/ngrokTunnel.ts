/**
 * Ngrok tunnel manager for development
 * Starts ngrok tunnel and sets NGROK_URL environment variable
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ngrok from 'ngrok'

export interface NgrokConfig {
  port: number
  authtoken?: string
  subdomain?: string
}

let tunnelUrl: string | null = null

export async function startNgrokTunnel(config: NgrokConfig): Promise<string> {
  if (tunnelUrl) {
    // eslint-disable-next-line no-console
    console.log(`Ngrok tunnel already running: ${tunnelUrl}`)
    return tunnelUrl
  }

  const ngrokConfig: ngrok.Ngrok.Options = {
    addr: config.port,
    proto: 'http',
  }

  // Use authtoken from env or config
  const authtoken = config.authtoken || process.env.NGROK_AUTHTOKEN
  if (authtoken) {
    ngrokConfig.authtoken = authtoken
  }

  // Use subdomain if provided (requires paid ngrok plan)
  if (config.subdomain) {
    ngrokConfig.subdomain = config.subdomain
  }

  try {
    // eslint-disable-next-line no-console
    console.log(`Starting ngrok tunnel on port ${config.port}...`)
    tunnelUrl = await ngrok.connect(ngrokConfig)

    // Set environment variable for the application to use
    process.env.NGROK_URL = tunnelUrl

    // eslint-disable-next-line no-console
    console.log(`\n🌐 Ngrok tunnel established!`)
    // eslint-disable-next-line no-console
    console.log(`   Public URL: ${tunnelUrl}`)
    // eslint-disable-next-line no-console
    console.log(`   Inspect:    http://127.0.0.1:4040`)
    // eslint-disable-next-line no-console
    console.log(`   Webhooks:`)
    // eslint-disable-next-line no-console
    console.log(`     - WhatsApp: ${tunnelUrl}/webhooks/whatsapp`)
    // eslint-disable-next-line no-console
    console.log(`     - EcoCash:  ${tunnelUrl}/webhooks/ecocash`)

    return tunnelUrl
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // eslint-disable-next-line no-console
    console.error(`Failed to start ngrok tunnel: ${errorMessage}`)

    // Check for common errors
    if (errorMessage.includes('authtoken')) {
      // eslint-disable-next-line no-console
      console.log('\n💡 To fix this:')
      // eslint-disable-next-line no-console
      console.log('   1. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken')
      // eslint-disable-next-line no-console
      console.log('   2. Set NGROK_AUTHTOKEN environment variable')
      // eslint-disable-next-line no-console
      console.log('   3. Or run: ngrok config add-authtoken YOUR_TOKEN')
    }

    throw error
  }
}

export async function stopNgrokTunnel(): Promise<void> {
  if (tunnelUrl) {
    await ngrok.disconnect(tunnelUrl)
    await ngrok.kill()
    tunnelUrl = null
    // eslint-disable-next-line no-console
    console.log('Ngrok tunnel stopped')
  }
}

export function getNgrokUrl(): string | null {
  return tunnelUrl || process.env.NGROK_URL || null
}

// Handle process exit
process.on('SIGINT', async () => {
  await stopNgrokTunnel()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stopNgrokTunnel()
  process.exit(0)
})
