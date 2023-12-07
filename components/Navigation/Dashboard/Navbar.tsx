import Logo from '../standard/logo'

import DashboardUserSection from '@/components/navigation/dashboard/sections/user-section'
import DashboardArtistSection from '@/components/navigation/dashboard/sections/artist-section'
import DashboardSettingsSection from '@/components/navigation/dashboard/sections/settings-section'

export default function Navbar() {
    return (
        <aside className="fixed h-full top-0 bottom-0 w-[20rem] backdrop-blur-xl overflow-y-auto bg-fullwhite/60 dark:bg-fullblack/60 flex flex-col items-center">
            <div className="mt-10">
                <Logo />
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
