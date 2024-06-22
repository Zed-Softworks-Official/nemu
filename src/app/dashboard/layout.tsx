import {
    BadgeDollarSign,
    BrushIcon,
    ClipboardListIcon,
    HandCoinsIcon,
    HomeIcon,
    ImageIcon,
    LayersIcon,
    MailIcon,
    PanelLeftIcon,
    UserIcon
} from 'lucide-react'

import { DashboardLogo } from '~/components/ui/logo'

import { redirect } from 'next/navigation'
import { api } from '~/trpc/server'
import { currentUser } from '@clerk/nextjs/server'
import { UserRole } from '~/core/structures'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { Button } from '~/components/ui/button'
import DashboardBreadcrumbs from '~/components/dashboard/header-breadcrumbs'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'
import { Suspense } from 'react'
import DashboardSidebarSkeleton from '~/components/skeletons/dashboard-sidebar-skeleton'

export const metadata = {
    title: 'Nemu | Artist Dashboard'
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen w-full flex-col bg-base-100">
            <aside className="fixed inset-y-0 left-0 z-10 hidden w-20 flex-col bg-base-200 sm:flex">
                <div className="p-5">
                    <DashboardLogo />
                    <div className="divider -mb-5"></div>
                </div>
                <Suspense fallback={<DashboardSidebarSkeleton />}>
                    <SidebarContent />
                </Suspense>
            </aside>
            <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-20">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-4 px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant={'outline'} className="sm:hidden">
                                <PanelLeftIcon className="h-6 w-6" />
                                <span className="sr-only">Toggle sidebar</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side={'left'} className="sm:max-w-xs">
                            <nav className="grid gap-5 text-lg font-medium">
                                <Link
                                    href={'/dashboard'}
                                    className="group flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-base-content md:text-base"
                                >
                                    <HomeIcon className="h-6 w-6" />
                                    <span className="sr-only">Home</span>
                                </Link>
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <DashboardBreadcrumbs />
                </header>
                <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:pt-5 md:gap-8">
                    {children}
                    <footer className="flex flex-row items-center justify-center gap-5">
                        <span className="text-base-content/80">
                            &copy; {new Date().getFullYear()}{' '}
                            <Link href={'https://zedsoftworks.com'} target={'_blank'}>
                                Zed Softworks LLC
                            </Link>
                        </span>
                    </footer>
                </main>
            </div>
        </div>
    )
}

async function SidebarContent() {
    const user = await currentUser()

    if (user?.publicMetadata.role !== UserRole.Artist) {
        return redirect('/u/login')
    }

    const dashboard_links = await api.stripe.get_dashboard_links()

    if (!dashboard_links) {
        return redirect('/u/login')
    }

    return (
        <>
            <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
                <SidebarItem
                    icon={<HomeIcon className="h-6 w-6" />}
                    title="Home"
                    href="/dashboard"
                    // path="home"
                />
                <SidebarItem
                    icon={<LayersIcon className="h-6 w-6" />}
                    title="Commissions"
                    href="/dashboard/commissions"
                />
                <SidebarItem
                    icon={<ImageIcon className="h-6 w-6" />}
                    title="Portfolio"
                    href="/dashboard/portfolio"
                />
                <SidebarItem
                    icon={<ClipboardListIcon className="h-6 w-6" />}
                    title="Forms"
                    href="/dashboard/forms"
                />
                <SidebarItem
                    icon={<MailIcon className="h-6 w-6" />}
                    title="Messages"
                    href="/dashboard/messages"
                />
            </nav>
            <nav className="mt-auto flex flex-col items-center gap-4 px-2 sm:py-5">
                <SidebarItem
                    icon={<BrushIcon className="h-6 w-6" />}
                    title="My Page"
                    href={`/@${user.publicMetadata.handle as string}`}
                />
                <SidebarItem
                    icon={<HandCoinsIcon className="h-6 w-6" />}
                    title={
                        dashboard_links.managment.type === 'onboarding'
                            ? 'Complete Onboarding'
                            : 'Payout'
                    }
                    href={dashboard_links.managment.url}
                />
                <SidebarItem
                    icon={<BadgeDollarSign className="h-6 w-6" />}
                    title="Supporter"
                    href={
                        dashboard_links.checkout_portal
                            ? dashboard_links.checkout_portal
                            : '/artists/supporter'
                    }
                />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link href={'/u/account'}>
                            <Avatar>
                                <AvatarImage src={user.imageUrl} alt="Avatar" />
                                <AvatarFallback>
                                    <UserIcon className="h-6 w-6" />
                                </AvatarFallback>
                            </Avatar>
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={5}>
                        Account
                    </TooltipContent>
                </Tooltip>
            </nav>
        </>
    )
}

function SidebarItem({
    title,
    href,
    icon
}: {
    title: string
    href: string
    icon: React.ReactNode
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Link href={href} className={'btn btn-ghost'}>
                    {icon}
                </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={5}>
                {title}
            </TooltipContent>
        </Tooltip>
    )
}
