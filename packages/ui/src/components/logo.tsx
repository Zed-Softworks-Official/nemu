'use client'

import { cn } from '@nemu/ui/lib/utils'
import Image, { type ImageProps } from 'next/image'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'

/** Native logo asset ratio (4147×1626). */
const LOGO_ASPECT = 4147 / 1626

type LogoProps = Omit<ImageProps, 'src' | 'alt'>

export function Logo({
    height = 40,
    width,
    className,
    ...props
}: LogoProps = {}) {
    const { resolvedTheme } = useTheme()

    const logoUrl = useMemo(() => {
        if (resolvedTheme === 'dark') {
            return '/logo-light.png'
        }

        return '/logo-dark.png'
    }, [resolvedTheme])

    const resolvedHeight = typeof height === 'number' ? height : 40
    const resolvedWidth =
        typeof width === 'number'
            ? width
            : Math.round(resolvedHeight * LOGO_ASPECT)

    return (
        <Image
            alt="Nemu Logo"
            className={cn('h-auto w-auto', className)}
            height={resolvedHeight}
            src={logoUrl}
            suppressHydrationWarning
            width={resolvedWidth}
            {...props}
        />
    )
}
