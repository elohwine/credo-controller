import { Head, Html, Main, NextScript } from "next/document";
import { ColorSchemeScript } from '@mantine/core';
import Footer from "@/components/sections/Footer";

export default function Document() {
  return (
    <Html lang="en" className="bg-white">
      <Head>
        <ColorSchemeScript defaultColorScheme="light" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
      <Footer />
    </Html>
  );
}
