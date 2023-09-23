import './globals.css'
import type { Metadata, } from 'next'

import Navbar from '@/components/Navigation/Navbar'
import Footer from '@/components/Footer'

import { UserProvider } from '@auth0/nextjs-auth0/client'
import { ToastContainer } from 'react-toastify';

import 'react-toastify/ReactToastify.min.css';

export const metadata: Metadata = {
    title: 'Nemu',
    description: 'An Artists Best Friend',
}

export default function RootLayout({ children, } : { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link href="https://necolas.github.io/normalize.css/8.0.1/normalize.css" rel="stylesheet" />
                <link rel="stylesheet" href="https://use.typekit.net/tru7say.css" />
            </head>
            <UserProvider>
                <body className='bg-white text-charcoal font-nunito dark:bg-charcoal dark:text-white'>
                    <Navbar />
                        { children }
                        <ToastContainer
                            position='bottom-right' 
                        />
                    <Footer />
                </body>
            </UserProvider>
        </html>
  )
}
