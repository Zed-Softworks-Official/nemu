import Logo from '../standard/logo'

import DashboardUserSection from '@/components/navigation/dashboard/sections/user-section'
import DashboardArtistSection from '@/components/navigation/dashboard/sections/artist-section'
import DashboardSettingsSection from '@/components/navigation/dashboard/sections/settings-section'
import { Bars3Icon } from '@heroicons/react/20/solid'

export default function Navbar({ children }: { children: React.ReactNode }) {
    return (
        <aside className="drawer lg:drawer-open">
            <input id="nemu-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content flex flex-col items-center justify-center">
                <label
                    htmlFor="nemu-drawer"
                    className="btn btn-primary drawer-button lg:hidden mt-5"
                >
                    <Bars3Icon className='text-white w-6 h-6 inline-block' />
                    Menu
                </label>
                {children}
            </div>
            <div className="drawer-side">
                <label
                    htmlFor="nemu-drawer"
                    aria-label="close sidebar"
                    className="drawer-overlay"
                />
                <ul className="menu p-4 w-80 min-h-full backdrop-blur-xl bg-fullwhite/60 dark:bg-fullblack/60 text-base-content">
                    <li>
                        <Logo />
                    </li>
                    <hr className="seperation" />
                    <DashboardArtistSection />
                    <hr className="seperation" />
                    <DashboardUserSection />
                    <hr className="seperation" />
                    <DashboardSettingsSection />
                </ul>
            </div>
        </aside>
    )
}
