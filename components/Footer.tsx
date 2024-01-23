'use client'

import classNames from '@/core/helpers'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import NemuImage from './nemu-image'

export default function Footer() {
    const pathname = usePathname()

    return (
        <footer className="flex flex-col justify-center items-center w-full p-10 text-base-content">
            <p>
                &copy; {new Date().getFullYear()}{' '}
                <Link href="https://zedsoftworks.com" target="_blank">
                    Zed Softworks LLC
                </Link>
            </p>
        </footer>
    )
}
