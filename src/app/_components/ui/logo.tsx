'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { motion } from 'motion/react'

import NemuImage from '~/app/_components/nemu-image'

export function FullLogo() {
    const { resolvedTheme } = useTheme()

    const src = useMemo(() => {
        switch (resolvedTheme) {
            case 'dark':
                return '/logos/logo-dark.png'
            case 'light':
                return '/logos/logo-light.png'
        }

        return '/logos/logo-dark.png'
    }, [resolvedTheme])

    return (
        <motion.div whileHover={{ scale: 1.1 }}>
            <Link href="/">
                <span className="sr-only">Nemu</span>
                <NemuImage src={src} alt="Nemu Logo" width={138} height={54} priority />
            </Link>
        </motion.div>
    )
}

export function IconLogo() {
    return (
        <motion.div whileHover={{ scale: 1.1 }}>
            <Link
                href="/"
                className="flex h-8 w-8 cursor-pointer flex-row items-center justify-center"
            >
                <NemuImage
                    src={'/logos/icon.png'}
                    alt="Nemu Logo"
                    width={80}
                    height={80}
                    priority
                />
            </Link>
        </motion.div>
    )
}
