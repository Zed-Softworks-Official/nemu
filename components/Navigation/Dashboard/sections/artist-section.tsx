'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import classNames from '@/helpers/classnames'
import {
    BuildingStorefrontIcon,
    PhotoIcon,
    RectangleStackIcon
} from '@heroicons/react/20/solid'

export default function DashboardArtistSection() {
    const pathname = usePathname()

    return (
        <>
            <li className='my-2'>
                <Link
                    href={'/dashboard/commissions'}
                    className={classNames(
                        pathname.includes('commissions')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <RectangleStackIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">
                        Commissions
                    </h3>
                </Link>
            </li>
            <li className='my-2'>
                <Link
                    href={'/dashboard/shop'}
                    className={classNames(
                        pathname.includes('shop')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <BuildingStorefrontIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">
                        Artist&apos;s Corner
                    </h3>
                </Link>
            </li>
            <li className='my-2'>
                <Link
                    href={'/dashboard/portfolio'}
                    className={classNames(
                        pathname.includes('portfolio')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <PhotoIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">Portfolio</h3>
                </Link>
            </li>
        </>
    )
}
