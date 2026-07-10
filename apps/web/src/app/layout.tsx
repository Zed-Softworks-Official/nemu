import '~/styles/globals.css'

import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Providers } from '~/components/providers'
import { ThemeProvider } from '~/components/theme-provider'
import { env } from '~/env'

export const metadata: Metadata = {
    title: 'Nemu',
    description: 'Control Everything. Share Nothing.',
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
}

const geist = Geist({
    subsets: ['latin'],
    variable: '--font-geist-sans',
})

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <ClerkProvider publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
            <html
                className={`${geist.variable}`}
                lang="en"
                suppressHydrationWarning
            >
                <body>
                    <ThemeProvider
                        attribute={'class'}
                        defaultTheme="system"
                        disableTransitionOnChange
                        enableSystem
                    >
                        <Providers>{children}</Providers>
                    </ThemeProvider>
                </body>
            </html>
        </ClerkProvider>
    )
}
