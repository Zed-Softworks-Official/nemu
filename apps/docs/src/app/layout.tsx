import "~/styles/globals.css";

import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";

export const metadata: Metadata = {
  title: "Nemu | Docs",
  description:
    "Nemu is an open-source, privacy-focused smart home controller from Zed Softworks. Local-first control for your devices—without sharing your life with the cloud.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
});

const navbar = <Navbar logo={<b>Nemu</b>} />;
const footer = (
  <Footer>
    Apache 2.0 {new Date().getFullYear()} &copy; Zed Softworks LLC.
  </Footer>
);

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={nunito.variable + " " + nunito.className + "antialiased"}
      lang="en"
      suppressHydrationWarning
    >
      <Head />
      <body>
        <Layout footer={footer} navbar={navbar} pageMap={await getPageMap()}>
          {children}
        </Layout>
      </body>
    </html>
  );
}
