'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import classNames from '@/helpers/classnames'
import { HomeIcon } from '@heroicons/react/20/solid'

export default function HomeSection() {
    const pathname = usePathname()
    return (
        <li className="my-2">
            <Link
                href={'/dashboard'}
                className={classNames(
                    pathname == '/dashboard'
                        ? 'bg-primary text-white'
                        : 'hover:bg-primary/60',
                    'p-4 px-10 rounded-xl'
                )}
            >
                <HomeIcon className="sidenav-icon" />
                <h3 className="inline text-lg font-bold">Home</h3>
            </Link>
        </li>
    )
}
