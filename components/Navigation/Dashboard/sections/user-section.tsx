'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import classNames from '@/helpers/classnames'
import { useDashboardContext } from '../dashboard-context'

import {
    EnvelopeIcon, StarIcon
} from '@heroicons/react/20/solid'
import DashboardArtistManagmentSection from './artist-managment-section'

export default function DashboardUserSection() {
    const pathname = usePathname()
    const { handle } = useDashboardContext()

    return (
        <div>
            {handle && <DashboardArtistManagmentSection />}
            <div className="my-10">
                <Link
                    href={'/dashboard/favourites'}
                    className={classNames(
                        pathname.includes('favourites')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <StarIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">Favourites</h3>
                </Link>
            </div>
            <div className="my-10">
                <Link
                    href={'/dashboard/messages'}
                    className={classNames(
                        pathname.includes('messages')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <EnvelopeIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">Messages</h3>
                </Link>
            </div>
        </div>
    )
}
