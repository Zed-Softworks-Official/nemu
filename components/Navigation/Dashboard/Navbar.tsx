import Logo from '../standard/logo'
import {
    Bars3Icon,
    BuildingStorefrontIcon,
    ClipboardDocumentListIcon,
    PhotoIcon,
    RectangleStackIcon
} from '@heroicons/react/20/solid'
import SidebarLink from '@/components/ui/sidebar-link'

export default function Navbar({ children }: { children: React.ReactNode }) {
    return (
        <aside className="drawer lg:drawer-open">
            <input id="nemu-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content flex flex-col items-center justify-center scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300">
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
                    <div className="collapse collapse-arrow">
                        <input
                            type="radio"
                            name="dashboard-nav-accordian"
                            title="artist sections"
                        />
                        <div className="collapse-title text-xl font-medium">
                            Artist Sections
                        </div>
                        <div className="collapse-content">
                            <SidebarLink
                                title="Commissions"
                                icon={<RectangleStackIcon className="w-6 h-6" />}
                                href="/dashboard/commissions"
                                path="commissions"
                            />
                            <SidebarLink
                                title="Artist's Corner"
                                icon={<BuildingStorefrontIcon className="w-6 h-6" />}
                                href="/dashboard/shop"
                                path="shop"
                            />
                            <SidebarLink
                                title="Portfolio"
                                icon={<PhotoIcon className="w-6 h-6" />}
                                href="/dashboard/portfolio"
                                path="portfolio"
                            />
                            <SidebarLink
                                title="Forms"
                                icon={<ClipboardDocumentListIcon className="w-6 h-6" />}
                                href="/dashboard/forms"
                                path="forms"
                            />
                        </div>
                    </div>

                    <div className="collapse collapse-arrow">
                        <input
                            type="radio"
                            name="dashboard-nav-accordian"
                            title="artist sections"
                        />
                        <div className="collapse-title text-xl font-medium">
                            Profile
                        </div>
                        <div className="collapse-content">
                            <SidebarLink
                                title="Commissions"
                                icon={<RectangleStackIcon className="w-6 h-6" />}
                                href="/dashboard/commissions"
                                path="commissions"
                            />
                            <SidebarLink
                                title="Artist's Corner"
                                icon={<BuildingStorefrontIcon className="w-6 h-6" />}
                                href="/dashboard/shop"
                                path="shop"
                            />
                            <SidebarLink
                                title="Portfolio"
                                icon={<PhotoIcon className="w-6 h-6" />}
                                href="/dashboard/portfolio"
                                path="portfolio"
                            />
                            <SidebarLink
                                title="Forms"
                                icon={<ClipboardDocumentListIcon className="w-6 h-6" />}
                                href="/dashboard/forms"
                                path="forms"
                            />
                        </div>
                    </div>

                    {/* <HomeSection />
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

                    <DashboardSettingsSection /> */}
                </ul>
            </div>
        </aside>
    )
}
