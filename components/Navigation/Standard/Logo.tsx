'use client'

import Link from 'next/link'
import { useThemeContext } from '@/components/theme/theme-context'
import NemuImage from '@/components/nemu-image'

export default function Logo() {
    const { theme } = useThemeContext()

    return (
        <div className="btn btn-ghost btn-lg hover:bg-transparent relative">
            {/* <div className="absolute bg-primary top-0 right-0 rounded-full px-2">
                <p className="text-xs">Beta</p>
            </div> */}
            <Link href={'/'}>
                {theme == 'nemu-dark' ? (
                    <NemuImage
                        src={'/logos/logo-dark.png'}
                        alt="Nemu"
                        width={140}
                        height={180}
                        draggable={false}
                    />
                ) : (
                    <NemuImage
                        src={'/logos/logo-light.png'}
                        alt="Nemu"
                        width={140}
                        height={180}
                        draggable={false}
                    />
                )}
            </Link>
        </div>
    )
}
