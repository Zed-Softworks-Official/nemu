import React from 'react'
import Link from 'next/link'

import DashboardUserSection from './Sections/UserSection'
import DashboardArtistSection from './Sections/ArtistSection'
import DashboardSettingsSection from './Sections/SettingsSection'

export default function Navbar() {
    return (
        <aside className="fixed h-full top-0 bottom-0 w-[20rem] backdrop-blur-xl overflow-y-auto bg-fullwhite/60 dark:bg-fullblack/60 flex flex-col items-center">
            <div className="mt-10">
                <Link href={'/'}>
                    <h1 className="text-center">Nemu</h1>
                </Link>
            </div>
            <hr className="seperation" />

            <DashboardArtistSection />
            <hr className="seperation" />

            <DashboardUserSection />
            <hr className="seperation" />

            <DashboardSettingsSection />
        </aside>
    )
}
