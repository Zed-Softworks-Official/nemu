'use client'

import Link from 'next/link'
import classNames from '@/helpers/classnames'
import { Cog6ToothIcon, PaintBrushIcon } from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import { useDashboardContext } from '../DashboardContext'

export default function DashboardSettingsSection() {
    const pathname = usePathname()
    const { handle } = useDashboardContext()

    return (
        <div>
            <div className="my-10">
                <Link
                    href={`/@${handle}`}
                    className={classNames(
                        pathname.includes('messages')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <PaintBrushIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">My Page</h3>
                </Link>
            </div>
            <div className="my-10">
                <Link
                    href={'/dashboard/settings'}
                    className={classNames(
                        pathname.includes('settings')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <Cog6ToothIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">Settings</h3>
                </Link>
            </div>
        </div>
    )
}
