'use client'

import { useTheme } from 'next-themes'
import Link from 'next/link'
import NemuImage from '~/components/nemu-image'
import { Badge } from '~/components/ui/badge'

export default function Logo() {
    const { resolvedTheme } = useTheme()

    return (
        <Link href="/" className="relative cursor-pointer">
            <Badge className="absolute -top-1 -right-10 badge-sm">Beta</Badge>
            {resolvedTheme === 'light' ? (
                <NemuImage
                    src={'/logos/logo-light.png'}
                    alt="Nemu Logo"
                    width={138}
                    height={54}
                    priority
                />
            ) : (
                <NemuImage
                    src={'/logos/logo-dark.png'}
                    alt="Nemu Logo"
                    width={138}
                    height={54}
                    priority
                />
            )}
        </Link>
    )
}
