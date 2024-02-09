'use client'

import Logo from '../standard/logo'
import HomeSection from './sections/home-section'

import { Bars3Icon } from '@heroicons/react/20/solid'

import DashboardUserSection from '@/components/navigation/dashboard/sections/user-section'
import DashboardArtistSection from '@/components/navigation/dashboard/sections/artist-section'
import DashboardSettingsSection from '@/components/navigation/dashboard/sections/settings-section'
import { usePathname } from 'next/navigation'

export default function Navbar({ children }: { children: React.ReactNode }) {
    const pathaname = usePathname()

    return (
        <aside className="drawer lg:drawer-open">
            <input id="nemu-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content flex flex-col items-center justify-center">
                <label
                    htmlFor="nemu-drawer"
                    className="btn btn-primary drawer-button lg:hidden mt-5"
                >
                    <Bars3Icon className="text-white w-6 h-6 inline-block" />
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
                <ul className="menu p-4 w-80 min-h-full backdrop-blur-xl bg-base-300/60 text-base-content">
                    <li>
                        <Logo />
                    </li>
                    <div className="divider"></div>
                    <HomeSection />
                    <div className="collapse collapse-arrow bg-base-200">
                        <input
                            type="radio"
                            name="dashboard-nav-accordian"
                            title="artist sections"
                            defaultChecked={pathaname.includes('commissions') || pathaname.includes('portfolio') || pathaname.includes('forms') || pathaname.includes('shop')}
                        />
                        <div className="collapse-title text-xl font-medium">
                            Artist Sections
                        </div>
                        <div className="collapse-content">
                            <DashboardArtistSection />
                        </div>
                    </div>
                    <div className="divider"></div>

                    <div className="collapse collapse-arrow bg-base-200">
                        <input
                            type="radio"
                            name="dashboard-nav-accordian"
                            title="profile"
                            defaultChecked={pathaname.includes('downloads') || pathaname.includes('messages') || pathaname.includes('favorites')}
                        />
                        <div className="collapse-title text-xl font-medium">Profile</div>
                        <div className="collapse-content">
                            <DashboardUserSection />
                        </div>
                    </div>

                    <DashboardSettingsSection />
                </ul>
            </div>
        </aside>
    )
}
