const nextConfig = {
  reactStrictMode: false,
  // Shared org configuration lives in credo-ui/shared and src/config (one mapping for API and both apps).
  experimental: { externalDir: true },
  output: 'standalone',
  // Common sign-in addresses go to the real page instead of a 404.
  async redirects() {
    return ['/login', '/signin', '/sign-in'].map((source) => ({ source, destination: '/auth/login', permanent: false }))
  },
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
