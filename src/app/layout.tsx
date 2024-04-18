import '~/styles/globals.css'
import 'react-toastify/dist/ReactToastify.css'

import NextTopLoader from 'nextjs-toploader'

import { Nunito } from 'next/font/google'

import { NextSSRPlugin } from '@uploadthing/react/next-ssr-plugin'
import { extractRouterConfig } from 'uploadthing/server'

import { ToastContainer } from 'react-toastify'

import { TRPCReactProvider } from '~/trpc/react'
import { ThemeProvider } from '~/components/theme-provider'
import { nemuFileRouter } from '~/app/api/uploadthing/core'

const nunito = Nunito({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-nunito'
})

export const metadata = {
    title: 'Nemu',
    description: 'An Artists Best Friend',
    icons: [{ rel: 'icon', url: '/favicon.ico' }]
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
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
                <ThemeProvider
                    attribute="data-theme"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <TRPCReactProvider>{children}</TRPCReactProvider>
                    <ToastContainer />
                </ThemeProvider>
            </body>
        </html>
    )
}
