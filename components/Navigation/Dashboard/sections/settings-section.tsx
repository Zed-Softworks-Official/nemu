'use client'

import Link from 'next/link'
import { ClassNames } from '@/core/helpers'
import { Cog6ToothIcon, PaintBrushIcon } from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import { useDashboardContext } from '../dashboard-context'

export default function DashboardSettingsSection() {
    const pathname = usePathname()
    const { handle } = useDashboardContext()

    return (
        <>
            {handle && (
                <li className="my-2">
                    <Link
                        href={`/@${handle}`}
                        className={'hover:bg-primary/60 p-4 px-10 rounded-xl'}
                    >
                        <PaintBrushIcon className="sidenav-icon" />
                        <h3 className="inline text-lg font-bold">My Page</h3>
                    </Link>
                </li>
            )}
            <li className="my-2">
                <Link
                    href={'/dashboard/settings'}
                    className={ClassNames(
                        pathname.includes('settings')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <Cog6ToothIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">Settings</h3>
                </Link>
            </li>
        </>
    )
}
