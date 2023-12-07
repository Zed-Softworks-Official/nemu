'use client'

import classNames from '@/helpers/classnames'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

export default function Footer() {
    const pathname = usePathname()

    return (
        <footer className={'text-center py-10'}>
            <p>
                &copy; {new Date().getFullYear()}{' '}
                <Link href="https://zedsoftworks.com" target="_blank">
                    Zed Softworks LLC
                </Link>
                . All Rights Reserved.
            </p>
        </footer>
    )
}
