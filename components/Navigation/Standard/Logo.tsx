'use client'

import React from 'react'

import Link from 'next/link'
import Image from 'next/image'
import { useThemeContext } from '@/components/theme/theme-context'

export default function Logo() {
    const { theme } = useThemeContext()

    return (
        <div className="logo inline">
            <Link href={'/'}>
                {theme == 'dark' ? (
                    <Image src={'/logo-dark.png'} alt="Nemu" width={150} height={200} draggable={false} />
                ) : (
                    <Image src={'/logo-light.png'} alt="Nemu" width={150} height={200} draggable={false}/>
                )}
            </Link>
        </div>
    )
}
