'use client'

import { useTheme } from 'next-themes'
import Link from 'next/link'
import { useMemo } from 'react'
import NemuImage from '~/components/nemu-image'
import { Badge } from '~/components/ui/badge'

export default function Logo() {
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
        <Link href="/" className="relative cursor-pointer">
            <Badge className="absolute -top-1 -right-10 badge-sm">Beta</Badge>
            <NemuImage src={src} alt="Nemu Logo" width={138} height={54} priority />
        </Link>
    )
}
