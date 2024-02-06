'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ClassNames } from '@/core/helpers'
import { useDashboardContext } from '../dashboard-context'

import {
    ArrowDownTrayIcon,
    EnvelopeIcon, StarIcon
} from '@heroicons/react/20/solid'
import DashboardArtistManagmentSection from './artist-managment-section'

export default function DashboardUserSection() {
    const pathname = usePathname()
    const { handle } = useDashboardContext()

    return (
        <div>
            {handle && <DashboardArtistManagmentSection />}
            <li className="my-2">
                <Link
                    href={'/dashboard/downloads'}
                    className={ClassNames(
                        pathname.includes('downloads')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <ArrowDownTrayIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">Downloads</h3>
                </Link>
            </li>
            <li className="my-2">
                <Link
                    href={'/dashboard/favourites'}
                    className={ClassNames(
                        pathname.includes('favourites')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <StarIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">Favourites</h3>
                </Link>
            </li>
            <li className="my-2">
                <Link
                    href={'/dashboard/messages'}
                    className={ClassNames(
                        pathname.includes('messages')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <EnvelopeIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">Messages</h3>
                </Link>
            </li>
        </div>
    )
}
