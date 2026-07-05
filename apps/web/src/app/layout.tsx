import '~/styles/globals.css'

import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { ThemeProvider } from '~/components/theme-provider'

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
        <ClerkProvider>
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
                        {children}
                    </ThemeProvider>
                </body>
            </html>
        </ClerkProvider>
    )
}
