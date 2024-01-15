'use client'

import Link from 'next/link'
import { useThemeContext } from '@/components/theme/theme-context'
import NemuImage from '@/components/nemu-image'

export default function Logo() {
    const { theme } = useThemeContext()

    return (
        <div className="btn btn-ghost btn-lg hover:bg-transparent">
            <Link href={'/'}>
                {theme == 'dark' ? (
                    <NemuImage src={'/logos/logo-dark.png'} alt="Nemu" width={140} height={180} draggable={false} />
                ) : (
                    <NemuImage src={'/logos/logo-light.png'} alt="Nemu" width={150} height={200} draggable={false} />
                )}
            </Link>
        </div>
    )
}
