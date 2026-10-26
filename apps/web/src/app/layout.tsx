import '~/styles/globals.css'

import { ClerkProvider } from '@clerk/nextjs'
import { ui } from '@clerk/ui'
import { shadcn } from '@clerk/ui/themes'
import favicon from '@nemu/assets/icons/favicon.ico'
import { ThemeProvider } from '@nemu/ui/components/theme-provider'
import { cn } from '@nemu/ui/lib/utils'
import type { Metadata } from 'next'
import { Geist_Mono, Instrument_Sans } from 'next/font/google'
import { env } from '~/env'

export const metadata: Metadata = {
    title: 'Nemu | Control Everything. Share Nothing.',
    description:
        'Nemu is an open-source, privacy-focused smart home controller from Zed Softworks. Local-first control for your devices—without sharing your life with the cloud.',
    icons: [{ rel: 'icon', url: favicon.src }],
}

const instrumentSans = Instrument_Sans({
    subsets: ['latin'],
    variable: '--font-instrument-sans',
})

const geistMono = Geist_Mono({
    subsets: ['latin'],
    variable: '--font-geist-mono',
})

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <ClerkProvider
            appearance={{ theme: shadcn }}
            publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
            ui={ui}
        >
            <html
                className={cn(
                    instrumentSans.variable,
                    instrumentSans.className,
                    geistMono.variable,
                    geistMono.className,
                    'dark antialiased'
                )}
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
                        {children}
                    </ThemeProvider>
                </body>
            </html>
        </ClerkProvider>
    )
}
