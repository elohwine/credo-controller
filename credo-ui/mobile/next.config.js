/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '')

const nextConfig = {
  // Only the hosted web copy (scripts/fly-deploy.sh) sets a base path; the APK and dev use none.
  ...(basePath ? { basePath } : {}),
  output: 'export', // Required for Capacitor — produces out/
  trailingSlash: true, // Required for static export routing
  images: { unoptimized: true }, // No Next.js image server in static mode
  reactStrictMode: false,
  // Shared org configuration lives in credo-ui/shared and src/config (one mapping for API and both apps).
  experimental: { externalDir: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    const path = require('path')
    // Shared screens live outside this app, so their imports resolve here.
    config.resolve.modules = [path.resolve(__dirname, 'node_modules'), ...(config.resolve.modules || [])]
    config.resolve.alias.react = path.dirname(require.resolve('react/package.json'))
    if (isServer) {
      // One Mantine for the page and the shared screens, or the theme provider is not found.
      config.externals = [
        ({ request }, callback) =>
          /^@mantine\/[^/]+$|^@tabler\/icons-react$/.test(request || '') ? callback(null, `commonjs ${request}`) : callback(),
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
      ]
    }
    return config
  },
}

module.exports = nextConfig
