import './globals.css'
import type { Metadata, } from 'next'

import AuthProvider from '@/components/Auth/AuthProvider';
import { ToastContainer } from 'react-toastify';

import 'react-toastify/ReactToastify.min.css';

export const metadata: Metadata = {
    title: 'Nemu',
    description: 'An Artists Best Friend',
}

export default function RootLayout({ children, } : { children: React.ReactNode }) {

    return (
        <html lang="en" className='dark'>
            <head>
                <link href="https://necolas.github.io/normalize.css/8.0.1/normalize.css" rel="stylesheet" />
                <link rel="stylesheet" href="https://use.typekit.net/tru7say.css" />
            </head>
            <AuthProvider>
                <body className='bg-white text-charcoal font-nunito dark:bg-charcoal dark:text-white'>
                    { children }
                    <ToastContainer position='top-right' />
                </body>
            </AuthProvider>
        </html>
  )
}
