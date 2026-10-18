import { Html, Head, Main, NextScript } from 'next/document';
import { ColorSchemeScript } from '@mantine/core';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <ColorSchemeScript defaultColorScheme="light" localStorageKey="credentis-color-scheme" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="application-name" content="Credentis" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Credentis" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#2188ca" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
