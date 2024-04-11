import Logo from '../standard/logo'

import SidebarLink from '@/components/ui/sidebar-link'
import { api } from '@/core/trpc/server'
import { getServerAuthSession } from '@/core/auth'
import { BadgeDollarSignIcon, BrushIcon, ClipboardList, HandCoinsIcon, ImageIcon, LayersIcon, MailIcon, MenuIcon, Settings2Icon, StoreIcon } from 'lucide-react'

export default async function Navbar({ children }: { children: React.ReactNode }) {
    const session = await getServerAuthSession()
    const managment_url = await api.stripe.get_managment_url()
    const portal_url = await api.stripe.get_checkout_portal()

    return (
        <aside className="drawer lg:drawer-open">
            <input id="nemu-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content flex flex-col items-center justify-center scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300">
                <label
                    htmlFor="nemu-drawer"
                    className="btn btn-primary drawer-button lg:hidden mt-5"
                >
                    <MenuIcon className="text-white w-6 h-6 inline-block" />
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
                    <SidebarLink
                        title="Commissions"
                        icon={<LayersIcon className="w-6 h-6" />}
                        href="/dashboard/commissions"
                        path="commissions"
                    />
                    <SidebarLink
                        title="Artist's Corner"
                        icon={<StoreIcon className="w-6 h-6" />}
                        href="/dashboard/shop"
                        path="shop"
                    />
                    <SidebarLink
                        title="Portfolio"
                        icon={<ImageIcon className="w-6 h-6" />}
                        href="/dashboard/portfolio"
                        path="portfolio"
                    />
                    <SidebarLink
                        title="Forms"
                        icon={<ClipboardList className="w-6 h-6" />}
                        href="/dashboard/forms"
                        path="forms"
                    />
                    <div className="divider"></div>
                    <SidebarLink
                        title="Messages"
                        icon={<MailIcon className="w-6 h-6" />}
                        href="/dashboard/messages"
                        path="messages"
                    />
                    <SidebarLink
                        title="Merchant's Home"
                        icon={<BadgeDollarSignIcon className="w-6 h-6" />}
                        href={managment_url.url}
                    />
                    <SidebarLink
                        title="Billing"
                        icon={<HandCoinsIcon className="w-6 h-6" />}
                        href={portal_url ? portal_url : '#'}
                    />
                    <SidebarLink
                        title="My Page"
                        icon={<BrushIcon className="w-6 h-6" />}
                        href={`/@${session?.user.handle}`}
                    />
                    <SidebarLink
                        title="Settings"
                        icon={<Settings2Icon className="w-6 h-6" />}
                        href={'/dashboard/account'}
                        path="account"
                    />
                </ul>
            </div>
        </aside>
    )
}
