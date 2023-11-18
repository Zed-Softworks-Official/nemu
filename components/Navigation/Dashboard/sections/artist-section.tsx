'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import classNames from '@/helpers/classnames'
import {
    BuildingStorefrontIcon,
    HomeIcon,
    PhotoIcon,
    RectangleStackIcon
} from '@heroicons/react/20/solid'

export default function DashboardArtistSection() {
    const pathname = usePathname()

    return (
        <div>
            <div className="my-10">
                <Link
                    href={'/dashboard'}
                    className={classNames(
                        pathname == '/dashboard'
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <HomeIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">Home</h3>
                </Link>
            </div>
            <div className="my-10">
                <Link
                    href={'/commissions'}
                    className={classNames(
                        pathname.includes('commissions')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <RectangleStackIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">
                        Commissions
                    </h3>
                </Link>
            </div>
            <div className="my-10">
                <Link
                    href={'/dashboard/shop'}
                    className={classNames(
                        pathname.includes('shop')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <BuildingStorefrontIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">
                        Artist's Corner
                    </h3>
                </Link>
            </div>
            <div className="my-10">
                <Link
                    href={'/dashboard/portfolio'}
                    className={classNames(
                        pathname.includes('portfolio')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <PhotoIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">Portfolio</h3>
                </Link>
            </div>
        </div>
    )
}