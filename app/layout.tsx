import './globals.css'
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'

import { ToastContainer } from 'react-toastify'

import 'react-toastify/ReactToastify.min.css'
import ThemeProvider from '@/components/theme/theme-context'
import NextTopLoader from 'nextjs-toploader'
import CookieConsentBanner from '@/components/cookie-consent-banner'
import TRPCProvider from '@/core/trpc/react'
import AuthProvider from '@/components/auth/auth-provider'
import { env } from '@/env'

// import { HighlightInit } from '@highlight-run/next/client'

export const nunito = Nunito({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-nunito'
})

export const metadata: Metadata = {
    metadataBase: new URL(env.BASE_URL),
    title: 'Nemu',
    description: 'An Artists Best Friend'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            
            <html lang="en" data-theme="nemu">
                <head>
                    <link
                        href="https://necolas.github.io/normalize.css/8.0.1/normalize.css"
                        rel="stylesheet"
                    />
                </head>
                <ThemeProvider>
                    <AuthProvider>
                        <TRPCProvider>
                            <body
                                className={`bg-base-100 text-base-content ${nunito.className} scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300`}
                            >
                                <NextTopLoader
                                    color="#2185d5"
                                    showSpinner={false}
                                    shadow="0 0 10px #3fa7fc, 0 0 5px #3fa7fc"
                                />
                                {children}
                                <ToastContainer position="top-right" />
                                <CookieConsentBanner />
                            </body>
                        </TRPCProvider>
                    </AuthProvider>
                </ThemeProvider>
            </html>
        </>
    )
}
