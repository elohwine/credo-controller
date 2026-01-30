import { d as defineEventHandler, g as getRequestURL, a as getRequestHeaders, s as setResponseHeaders, c as createError } from '../../nitro/nitro.mjs';
import http from 'node:http';
import 'unified';
import 'remark-parse';
import 'remark-rehype';
import 'remark-mdc';
import 'remark-gfm';
import 'rehype-external-links';
import 'rehype-sort-attribute-values';
import 'rehype-sort-attributes';
import 'rehype-raw';
import 'detab';
import 'micromark-util-sanitize-uri';
import 'hast-util-to-string';
import 'github-slugger';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@intlify/utils';
import 'vue-router';
import 'node:url';
import '@iconify/utils';
import 'consola';

const TARGET_HOST = process.env.PROXY_TARGET_HOST || "credentis-api.internal";
const TARGET_PORT = Number(process.env.PROXY_TARGET_PORT) || 6e3;
const ____path_ = defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const method = event.node.req.method || "GET";
  const fullPath = url.pathname;
  const targetPath = fullPath.replace(/^\/wallet-api/, "/api/wallet") + url.search;
  console.log(`[wallet-api-proxy] ${method} ${fullPath} -> http://${TARGET_HOST}:${TARGET_PORT}${targetPath}`);
  return new Promise((resolve, reject) => {
    const headers = { ...getRequestHeaders(event) };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];
    const requestOptions = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: targetPath,
      method,
      headers: {
        ...headers,
        host: `${TARGET_HOST}:${TARGET_PORT}`
        // Set correct host header
      }
    };
    const req = http.request(requestOptions, (res) => {
      event.node.res.statusCode = res.statusCode || 500;
      event.node.res.statusMessage = res.statusMessage || "";
      const responseHeaders = res.headers;
      Object.entries(responseHeaders).forEach(([key, value]) => {
        if (value) {
          setResponseHeaders(event, { [key]: value });
        }
      });
      resolve(res);
    });
    req.on("error", (error) => {
      console.error(`[wallet-api-proxy] Request error:`, error);
      reject(createError({
        statusCode: 502,
        statusMessage: "Bad Gateway",
        message: `Proxy error: ${error.message}`
      }));
    });
    event.node.req.pipe(req);
  });
});

export { ____path_ as default };
//# sourceMappingURL=_...path_.mjs.map
