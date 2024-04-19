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
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'
import Footer from '~/components/footer'
import DashboardProvider from '~/components/dashboard/dashboard-context'

export default async function Layout({ children }: { children: React.ReactNode }) {
    const session = await getServerAuthSession()

    if (!session?.user.artist_id) {
        return redirect('/u/login')
    }

    const managment_url = await api.stripe.get_managment_url()
    const portal_url = await api.stripe.get_checkout_portal()

    return (
        <aside className="drawer lg:drawer-open">
            <input id="nemu-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content flex flex-col items-center justify-center scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300">
                <label
                    htmlFor="nemu-drawer"
                    className="btn btn-primary drawer-button lg:hidden mt-5 text-base-content"
                >
                    <MenuIcon className="w-6 h-6 inline-block" />
                    Menu
                </label>

                <DashboardProvider artist_id={session.user.artist_id}>
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
                <ul className="menu p-4 w-80 min-h-full backdrop-blur-xl bg-base-300/60 text-base-content">
                    <div className="flex justify-center items-center">
                        <Logo />
                    </div>
                    <div className="divider"></div>
                    <SidebarLink
                        title="Commissions"
                        icon={<LayersIcon className="w-6 h-6" />}
                        href="/dashboard/commissions"
                        path="commissions"
                    />
                    <SidebarLink
                        title="Artist Corner"
                        icon={<StoreIcon className="w-6 h-6" />}
                        href="/dashboard/artist-corner"
                        path="artist-corner"
                    />
                    <SidebarLink
                        title="Portfolio"
                        icon={<ImageIcon className="w-6 h-6" />}
                        href="/dashboard/portfolio"
                        path="portfolio"
                    />
                    <SidebarLink
                        title="Forms"
                        icon={<ClipboardListIcon className="w-6 h-6" />}
                        href="/dashboard/forms"
                        path="forms"
                    />
                    <div className="divider"></div>
                    <SidebarLink
                        title="Merchant's Home"
                        icon={<HandCoinsIcon className="w-6 h-6" />}
                        href={managment_url.url}
                    />
                    <SidebarLink
                        title="Billing"
                        icon={<BadgeDollarSign className="w-6 h-6" />}
                        href={portal_url ? portal_url : '#'}
                    />
                    <div className="divider"></div>
                    <SidebarLink
                        title="My Page"
                        icon={<BrushIcon className="w-6 h-6" />}
                        href={`/@${session?.user.handle}`}
                    />
                    <SidebarLink
                        title="Messages"
                        icon={<MailIcon className="w-6 h-6" />}
                        href="/dashboard/messages"
                        path="messages"
                    />
                    <SidebarLink
                        title="Account"
                        icon={<Settings2Icon className="w-6 h-6" />}
                        href={'/account'}
                        path="account"
                    />
                </ul>
            </div>
        </aside>
    )
}
