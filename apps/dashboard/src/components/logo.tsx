'use client'

import Image, { type ImageProps } from 'next/image'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'

type LogoProps = Omit<ImageProps, 'src' | 'alt'>

export function Logo({ height = 100, width = 100, ...props }: LogoProps = {}) {
    const { resolvedTheme } = useTheme()

    const logoUrl = useMemo(() => {
        if (resolvedTheme === 'dark') {
            return '/logo-light.png'
        }

        return '/logo-dark.png'
    }, [resolvedTheme])

    return (
        <Image
            alt="Nemu Logo"
            height={height}
            src={logoUrl}
            suppressHydrationWarning
            width={width}
            {...props}
        />
    )
}
