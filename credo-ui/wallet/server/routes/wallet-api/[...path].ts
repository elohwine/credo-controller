/**
 * Catch-all route to proxy /wallet-api requests to the API backend
 * Uses node:http directly to avoid undici/fetch IPv6/port parsing issues
 */
import { defineEventHandler, getRequestURL, createError, getRequestHeaders, setResponseHeaders } from 'h3'
import http from 'node:http'

const TARGET_HOST = process.env.PROXY_TARGET_HOST || 'credentis-api.internal'
const TARGET_PORT = Number(process.env.PROXY_TARGET_PORT) || 6000

export default defineEventHandler(async (event) => {
    const url = getRequestURL(event)
    const method = event.node.req.method || 'GET'
    const fullPath = url.pathname

    // Rewrite: /wallet-api/... -> /api/wallet/...
    const targetPath = fullPath.replace(/^\/wallet-api/, '/api/wallet') + url.search

    console.log(`[wallet-api-proxy] ${method} ${fullPath} -> http://${TARGET_HOST}:${TARGET_PORT}${targetPath}`)

    return new Promise((resolve, reject) => {
        const headers = { ...getRequestHeaders(event) }

        // Clean up headers
        delete headers.host
        delete headers.connection
        delete headers['content-length'] // Let http.request handle chunked or recalculated length unless we pipe exact bytes?
        // Actually, if we pipe, we might send chunked. If we have content-length from client, we can pass it if we trust it.
        // But safer to let Node handle it or just pass it if it exists?
        // Let's pass common headers but ensure Host is correct.

        // Explicitly set headers we want
        const requestOptions: http.RequestOptions = {
            hostname: TARGET_HOST,
            port: TARGET_PORT,
            path: targetPath,
            method: method,
            headers: {
                ...headers,
                host: `${TARGET_HOST}:${TARGET_PORT}`, // Set correct host header
            }
        }

        const req = http.request(requestOptions, (res) => {
            // Forward status code
            event.node.res.statusCode = res.statusCode || 500
            event.node.res.statusMessage = res.statusMessage || ''

            // Forward headers
            const responseHeaders: Record<string, string | string[] | undefined> = res.headers
            Object.entries(responseHeaders).forEach(([key, value]) => {
                if (value) {
                    setResponseHeaders(event, { [key]: value })
                }
            })

            // Pipe response body
            // We can return the stream directly in h3
            resolve(res)
        })

        req.on('error', (error: any) => {
            console.error(`[wallet-api-proxy] Request error:`, error)
            reject(createError({
                statusCode: 502,
                statusMessage: 'Bad Gateway',
                message: `Proxy error: ${error.message}`
            }))
        })

        // Pipe request body to backend
        event.node.req.pipe(req)
    })
})
