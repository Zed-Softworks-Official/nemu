import "~/styles/globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { shadcn } from "@clerk/ui/themes";
import { SidebarInset, SidebarProvider } from "@nemu/ui/components/sidebar";
import { ThemeProvider } from "@nemu/ui/components/theme-provider";
import { cn } from "@nemu/ui/lib/utils";
import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Header } from "~/components/header/header";
import { NemuProvider } from "~/components/nemu-providers";
import { AppSidebar } from "~/components/sidebar/app-sidebar";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "Nemu | Dashboard",
  description:
    "Nemu is an open-source, privacy-focused smart home controller from Zed Softworks. Local-first control for your devices—without sharing your life with the cloud.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{ theme: shadcn }}
      publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      ui={ui}
    >
      <NemuProvider>
        <html
          className={cn(nunito.variable, nunito.className, "dark antialiased")}
          lang="en"
          suppressHydrationWarning
        >
          <body>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              disableTransitionOnChange
              enableSystem
            >
              <DashboardLayout>{children}</DashboardLayout>
            </ThemeProvider>
          </body>
        </html>
      </NemuProvider>
    </ClerkProvider>
  );
}

function DashboardLayout(props: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-3 md:peer-data-[variant=inset]:m-3 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border md:peer-data-[variant=inset]:shadow-lg">
        <Header />
        <div className="flex flex-1 flex-col p-5">{props.children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
