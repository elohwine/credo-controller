import { defineNuxtConfig } from "nuxt/config";
import presetIcons from "@unocss/preset-icons";
import path from "path";

export default defineNuxtConfig({
    devtools: { enabled: true },
    srcDir: "src",
    serverDir: "server",

    // Configure dev server to use port 4000
    devServer: {
        port: 4000,
        host: 'localhost'
    },

    modules: [
        "@vueuse/nuxt",
        ["@unocss/nuxt", { autoImport: false }],
        "@nuxtjs/i18n",
        "@nuxtjs/color-mode",
        "@vite-pwa/nuxt",
        "@sidebase/nuxt-auth",
        "@nuxt/content",
        "@pinia/nuxt",
        "nuxt-icon"
    ],

    build: {
        transpile: ["@headlessui/vue"]
    },

    auth: {
        baseURL: "/wallet-api/auth",

        provider: {
            type: "local",
            token: {
                maxAgeInSeconds: 60 * 60 * 24 * 30, // 30 days
                cookieName: 'auth.token',
                sameSiteAttribute: 'strict'
            },

            endpoints: {
                signIn: {
                    // Legacy auth system: POST /login
                    // ktor-authnz system: POST /account/emailpass
                    path: process.env.NUXT_PUBLIC_AUTH_USE_KTORAUTHNZ === 'true'
                        ? '/account/emailpass'
                        : '/login',
                    method: 'post'
                },

                signOut: { path: '/logout', method: 'post' },
                signUp: { path: '/register', method: 'post' },
                getSession: { path: '/session', method: 'get' },
            },

            pages: {
                login: "/login",
            },
        },

        globalAppMiddleware: {
            isEnabled: true,
        },
    },

    pwa: {
        registerWebManifestInRouteRules: true,

        srcDir: "public/sw",
        filename: "worker.js",

        strategies: "injectManifest",
        injectRegister: "script",
        injectManifest: { injectionPoint: undefined },
        registerType: "autoUpdate",
        // notification-worker.js
        manifest: {
            name: "IdenEx wallet",
            short_name: "IdenEx",
            display: "standalone",
            theme_color: "#0573f0",
            icons: [
                {
                    src: "/icons/android-icon-36x36.png",
                    sizes: "36x36",
                    type: "image/png",
                },
                {
                    src: "/icons/android-icon-48x48.png",
                    sizes: "48x48",
                    type: "image/png",
                },
                {
                    src: "/icons/android-icon-72x72.png",
                    sizes: "72x72",
                    type: "image/png",
                },
                {
                    src: "/icons/android-icon-96x96.png",
                    sizes: "96x96",
                    type: "image/png",
                },
                {
                    src: "/icons/android-icon-144x144.png",
                    sizes: "144x144",
                    type: "image/png",
                },
                {
                    src: "/icons/credentis-icon-192x192.png",
                    sizes: "192x192",
                    type: "image/png"
                },
                {
                    src: "/icons/credentis-icon-512x512.png",
                    sizes: "512x512",
                    type: "image/png"
                },
                {
                    src: "/icons/credentis-icon-512x512.png",
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "any maskable"
                }
            ],
            shortcuts: [
                {
                    name: "Scan QR code",
                    short_name: "Scan QR",
                    url: "/wallet/scan-qr",
                    description: "Scan a QR code to receive/present credentials from/to a service."
                }
            ]
        },
        workbox: {
            navigateFallback: null,
            globPatterns: ["client/**/*.{js,css,ico,png,svg,webp,woff,woff2}"]
        },
        client: {
            installPrompt: true,
            // you don't need to include this: only for testing purposes
            // if enabling periodic sync for update use 1 hour or so (periodicSyncForUpdates: 3600)
            periodicSyncForUpdates: 20
        },
        devOptions: {
            enabled: true,
            type: "module"
        }
    },

    unocss: {
        uno: false,
        preflight: false,
        icons: true,
        presets: [
            presetIcons({
                scale: 1.2,
                extraProperties: {
                    display: "inline-block"
                }
            })
        ],
        safelist: ["i-twemoji-flag-us-outlying-islands", "i-twemoji-flag-turkey"]
    },

    typescript: {
        tsConfig: {
            compilerOptions: {
                strict: true,
                types: ["./type.d.ts"]
            }
        }
    },

    colorMode: {
        classSuffix: "",
        fallback: "light",
        storageKey: "color-mode"
    },

    vite: {
        logLevel: "info",
        resolve: {
            alias: {
                "@credentis-web-wallet": path.resolve(__dirname, "./libs"),
            }
        },
        server: {
            proxy: {
                '/wallet-api': {
                    target: 'http://localhost:6000',
                    changeOrigin: true,
                    // rewrite to backend route prefix
                    rewrite: (p: string) => p.replace(/^\/wallet-api/, '/api/wallet')
                },
                '/api/finance': {
                    target: 'http://localhost:6000',
                    changeOrigin: true,
                }
            }
        }
    },

    runtimeConfig: {
        public: {
            projectId: process.env.ProjectId,
            issuerCallbackUrl: process.env.NUXT_PUBLIC_ISSUER_CALLBACK_URL || "https://credentis-api-v2.fly.dev",
            credentialsRepositoryUrl: process.env.NUXT_PUBLIC_CREDENTIALS_REPOSITORY_URL || "https://credentis-api-v2.fly.dev:3000",
            devWalletUrl: process.env.NUXT_PUBLIC_DEV_WALLET_URL || "https://wallet-dev.IdenEx",
            walletBackendUrl: process.env.NUXT_PUBLIC_WALLET_BACKEND_URL || "https://credentis-api-v2.fly.dev:6000",
            financeApiUrl: process.env.NUXT_PUBLIC_FINANCE_API_URL || "https://credentis-api-v2.fly.dev:6000",
        }
    },

    nitro: {
        compressPublicAssets: {
            gzip: true,
            brotli: false
        },
        routeRules: {
            // Proxy is now handled by server/middleware/proxy.ts
            // which properly sets Host header for Fly.io compatibility
        },

        devProxy: {
            '/wallet-api': {
                target: 'http://localhost:6000',
                changeOrigin: true,
                // Nitro/devProxy accepts `rewrite` or `pathRewrite` depending on version.
                // Support both to maximize compatibility.
                rewrite: (path: string) => path.replace(/^\/wallet-api/, '/api/wallet'),
                pathRewrite: (path: string) => path.replace(/^\/wallet-api/, '/api/wallet')
            }
        }
    },

    // i18n: {
    //     lazy: true,
    //     langDir: 'locales',  // need `lang` dir on `admin`
    //     defaultLocale: "en-US",
    //     detectBrowserLanguage: false,
    //     locales: [
    //         {
    //             code: 'en',
    //             file: 'en-US.json',
    //         },
    //         {
    //             code: 'tr',
    //             file: 'tr-TR.json',
    //         },
    //     ]
    // }
    //proxy: [ 'http://localhost:4545/api' ]

    ssr: false,
    compatibilityDate: "2024-07-26"
});
