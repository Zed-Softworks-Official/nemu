import '~/styles/globals.css'

import NextTopLoader from 'nextjs-toploader'

import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'

import { NextSSRPlugin } from '@uploadthing/react/next-ssr-plugin'
import { extractRouterConfig } from 'uploadthing/server'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

import { TRPCReactProvider } from '~/trpc/react'
import { ThemeProvider } from '~/components/theme-provider'
import { nemuFileRouter } from '~/app/api/uploadthing/core'
import { TooltipProvider } from '~/components/ui/tooltip'
import { Toaster } from '~/components/ui/sonner'
import PosthogProvider from '~/components/posthog-provider'
import { env } from '~/env'

const nunito = Nunito({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-nunito'
})

export const metadata = {
    title: 'Nemu',
    description: 'An Artists Best Friend',
    icons: [{ rel: 'icon', url: '/favicon.ico' }]
} satisfies Metadata

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${nunito.className}`}>
                <NextTopLoader
                    color="#2185d5"
                    showSpinner={false}
                    shadow="0 0 10px #3fa7fc, 0 0 5px #3fa7fc"
                />
                <NextSSRPlugin
                    /**
                     * The `extractRouterConfig` will extract **only** the route configs
                     * from the router to prevent additional information from being
                     * leaked to the client. The data passed to the client is the same
                     * as if you were to fetch `/api/uploadthing` directly.
                     */
                    routerConfig={extractRouterConfig(nemuFileRouter)}
                />
                <ClerkProvider appearance={{ baseTheme: dark }} publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
                    <PosthogProvider>
                        <ThemeProvider
                            attribute="data-theme"
                            defaultTheme="system"
                            enableSystem
                            disableTransitionOnChange
                        >
                            <TooltipProvider>
                                <TRPCReactProvider>{children}</TRPCReactProvider>
                            </TooltipProvider>
                            <Toaster position="bottom-right" richColors />
                        </ThemeProvider>
                    </PosthogProvider>
                </ClerkProvider>
            </body>
        </html>
    )
}
