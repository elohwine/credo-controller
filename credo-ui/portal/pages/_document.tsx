import { Head, Html, Main, NextScript } from "next/document";
import { ColorSchemeScript } from '@mantine/core';
import { PRODUCT_NAME } from "@/utils/orgProfile";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <ColorSchemeScript defaultColorScheme="light" localStorageKey="credentis-color-scheme" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="application-name" content={PRODUCT_NAME} />
        <meta name="theme-color" content="#2188ca" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
