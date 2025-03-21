import '~/styles/globals.css'

import NextTopLoader from 'nextjs-toploader'

import { Nunito } from 'next/font/google'
import { type Metadata } from 'next'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

import PlausibleProvider from 'next-plausible'

import { env } from '~/env'
import { TRPCReactProvider } from '~/trpc/react'

import { ThemeProvider } from '~/app/_components/themes/theme-provider'
import { Toaster } from '~/app/_components/ui/sonner'
import { PosthogProvider } from '~/app/_components/posthog-provider'
import { Featurebase } from '~/app/_components/featurebase'

const nunito = Nunito({
    subsets: ['latin']
})

export const metadata: Metadata = {
    title: 'Nemu',
    description: 'The open-source platform for artists',
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
    openGraph: {
        images: [
            {
                url: 'https://nemu.art/opengraph/nemu-full.jpg'
            }
        ],
        siteName: 'Nemu',
        title: 'Nemu',
        description: 'The open-source platform for artists'
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Nemu',
        description: 'The open-source platform for artists',
        images: [
            {
                url: 'https://nemu.art/opengraph/nemu-full.jpg'
            }
        ]
    }
}

export default function RootLayout({
    children
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${nunito.className}`} suppressHydrationWarning>
            <body>
                <NextTopLoader
                    color="#2185d5"
                    showSpinner={false}
                    shadow="0 0 10px #3fa7fc, 0 0 5px #3fa7fc"
                />
                <ClerkProvider
                    appearance={{
                        baseTheme: dark
                    }}
                    publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
                    dynamic
                >
                    <PlausibleProvider domain={'nemu.art'}>
                        <PosthogProvider>
                            <ThemeProvider
                                attribute={'class'}
                                defaultTheme={'dark'}
                                enableSystem
                                disableTransitionOnChange
                            >
                                <TRPCReactProvider>{children}</TRPCReactProvider>
                                <Toaster position="bottom-right" richColors />
                                <Featurebase />
                            </ThemeProvider>
                        </PosthogProvider>
                    </PlausibleProvider>
                </ClerkProvider>
            </body>
        </html>
    )
}
