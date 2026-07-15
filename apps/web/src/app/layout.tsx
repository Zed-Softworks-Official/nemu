import '~/styles/globals.css'

import { ClerkProvider } from '@clerk/nextjs'
import { ui } from '@clerk/ui'
import { shadcn } from '@clerk/ui/themes'
import { cn } from '@nemu/ui/lib/utils'
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import { ThemeProvider } from '~/components/theme-provider'
import { env } from '~/env'

export const metadata: Metadata = {
    title: 'Nemu | Control Everything. Share Nothing.',
    description:
        'Nemu is an open-source, privacy-focused smart home controller from Zed Softworks. Local-first control for your devices—without sharing your life with the cloud.',
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
}

const nunito = Nunito({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800'],
    variable: '--font-nunito',
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
                    nunito.variable,
                    nunito.className,
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
