'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { motion } from 'motion/react'

import NemuImage from '~/components/nemu-image'
import { Badge } from '~/components/ui/badge'

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
            <Link href="/" className="group flex shrink-0 cursor-pointer flex-row pr-12">
                <NemuImage src={src} alt="Nemu Logo" width={138} height={54} priority />
                <Badge className="h-5 rounded-full">Beta</Badge>
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
