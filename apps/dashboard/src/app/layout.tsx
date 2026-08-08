import '~/styles/globals.css'

import { ClerkProvider } from '@clerk/nextjs'
import { ui } from '@clerk/ui'
import { shadcn } from '@clerk/ui/themes'
import favicon from '@nemu/assets/icons/favicon.ico'
import { ThemeProvider } from '@nemu/ui/components/theme-provider'
import { cn } from '@nemu/ui/lib/utils'
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import { NemuProvider } from '~/components/nemu-providers'
import { env } from '~/env'

export const metadata: Metadata = {
    title: 'Nemu | Dashboard',
    description:
        'Nemu is an open-source, privacy-focused smart home controller from Zed Softworks. Local-first control for your devices—without sharing your life with the cloud.',
    icons: [{ rel: 'icon', url: favicon.src }],
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
            signInFallbackRedirectUrl="/"
            signInUrl="/sign-in"
            ui={ui}
        >
            <NemuProvider>
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
            </NemuProvider>
        </ClerkProvider>
    )
}
