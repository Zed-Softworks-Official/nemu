import './globals.css'
import type { Metadata, } from 'next'

import Navbar from '../components/Navbar'

export const metadata: Metadata = {
    title: 'Nemu',
    description: 'An Artists Best Friend',
}

export default function RootLayout({
    children,
} : {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <head>
                <link href="https://necolas.github.io/normalize.css/8.0.1/normalize.css" rel="stylesheet" />
                <link rel="stylesheet" href="https://use.typekit.net/tru7say.css" />
            </head>
            <body className='bg-slate'>
                <Navbar />
                {children}
            </body>
        </html>
  )
}
