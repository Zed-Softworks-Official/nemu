import '~/styles/globals.css'

import { Nunito } from 'next/font/google'

import { TRPCReactProvider } from '~/trpc/react'
import { ThemeProvider } from '~/components/theme-provider'
import StandardNavbar from '~/components/navbar/standard-navbar'

const nunito = Nunito({
    subsets: ['latin'],
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
            <body className={`font-sans ${nunito.variable}`}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <TRPCReactProvider>{children}</TRPCReactProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}