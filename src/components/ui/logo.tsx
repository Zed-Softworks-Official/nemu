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
        <Link href="/" className="flex cursor-pointer flex-row">
            <NemuImage src={src} alt="Nemu Logo" width={138} height={54} priority />
            <Badge className="badge-sm">Beta</Badge>
        </Link>
    )
}
