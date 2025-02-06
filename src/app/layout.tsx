import '~/styles/globals.css'

import NextTopLoader from 'nextjs-toploader'

import { Nunito } from 'next/font/google'
import { type Metadata } from 'next'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

import { TRPCReactProvider } from '~/trpc/react'
import { ThemeProvider } from '~/components/themes/theme-provider'
import { env } from '~/env'
import { Toaster } from '~/components/ui/sonner'
import { PosthogProvider } from '~/components/posthog-provider'
import PlausibleProvider from 'next-plausible'

const nunito = Nunito({
    subsets: ['latin']
})

export const metadata: Metadata = {
    title: 'Nemu',
    description: 'An Artists Best Friend',
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
    openGraph: {
        images: [
            {
                url: 'https://nemu.art/profile.png'
            }
        ],
        siteName: 'Nemu',
        title: 'Nemu',
        description: 'An Artists Best Friend',
        url: 'https://nemu.art'
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Nemu',
        description: 'An Artists Best Friend',
        images: [
            {
                url: 'https://nemu.art/profile.png'
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
                            </ThemeProvider>
                        </PosthogProvider>
                    </PlausibleProvider>
                </ClerkProvider>
            </body>
        </html>
    )
}
