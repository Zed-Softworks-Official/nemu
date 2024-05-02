import {
    BadgeDollarSign,
    BrushIcon,
    ClipboardListIcon,
    HandCoinsIcon,
    ImageIcon,
    LayersIcon,
    MailIcon,
    MenuIcon,
    Settings2Icon,
    StoreIcon
} from 'lucide-react'

import Logo from '~/components/ui/logo'
import SidebarLink from '~/components/ui/sidebar-link'

import { redirect } from 'next/navigation'
import { api } from '~/trpc/server'
import Footer from '~/components/footer'
import DashboardProvider from '~/components/dashboard/dashboard-context'
import { currentUser } from '@clerk/nextjs/server'
import { UserRole } from '~/core/structures'

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await currentUser()

    if (user?.publicMetadata.role !== UserRole.Artist) {
        return redirect('/u/login')
    }

    const managment_url = await api.stripe.get_managment_url()
    const portal_url = await api.stripe.get_checkout_portal()

    return (
        <aside className="drawer lg:drawer-open">
            <input id="nemu-drawer" type="checkbox" className="drawer-toggle" />
            <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300 drawer-content flex flex-col items-center justify-center">
                <label
                    htmlFor="nemu-drawer"
                    className="btn btn-primary drawer-button mt-5 text-base-content lg:hidden"
                >
                    <MenuIcon className="inline-block h-6 w-6" />
                    Menu
                </label>

                <DashboardProvider artist_id={user.publicMetadata.artist_id as string}>
                    {children}
                </DashboardProvider>

                <Footer />
            </div>
            <div className="drawer-side">
                <label
                    htmlFor="nemu-drawer"
                    aria-label="close sidebar"
                    className="drawer-overlay"
                />
                <ul className="menu min-h-full w-80 bg-base-300/60 p-4 text-base-content backdrop-blur-xl">
                    <div className="flex items-center justify-center">
                        <Logo />
                    </div>
                    <div className="divider"></div>
                    <SidebarLink
                        title="Commissions"
                        icon={<LayersIcon className="h-6 w-6" />}
                        href="/dashboard/commissions"
                        path="commissions"
                    />
                    <SidebarLink
                        title="Artist Corner"
                        icon={<StoreIcon className="h-6 w-6" />}
                        href="/dashboard/artist-corner"
                        path="artist-corner"
                    />
                    <SidebarLink
                        title="Portfolio"
                        icon={<ImageIcon className="h-6 w-6" />}
                        href="/dashboard/portfolio"
                        path="portfolio"
                    />
                    <SidebarLink
                        title="Forms"
                        icon={<ClipboardListIcon className="h-6 w-6" />}
                        href="/dashboard/forms"
                        path="forms"
                    />
                    <div className="divider"></div>
                    <SidebarLink
                        title={
                            managment_url.type === 'onboarding'
                                ? 'Complete Onboarding'
                                : 'Payout'
                        }
                        icon={<HandCoinsIcon className="h-6 w-6" />}
                        href={managment_url.url}
                    />
                    <SidebarLink
                        title="Billing"
                        icon={<BadgeDollarSign className="h-6 w-6" />}
                        href={portal_url ? portal_url : '#'}
                    />
                    <div className="divider"></div>
                    <SidebarLink
                        title="My Page"
                        icon={<BrushIcon className="h-6 w-6" />}
                        href={`/@${user.publicMetadata.handle as string}`}
                    />
                    <SidebarLink
                        title="Messages"
                        icon={<MailIcon className="h-6 w-6" />}
                        href="/dashboard/messages"
                        path="messages"
                    />
                    <SidebarLink
                        title="Account"
                        icon={<Settings2Icon className="h-6 w-6" />}
                        href={'/account'}
                        path="account"
                    />
                </ul>
            </div>
        </aside>
    )
}
