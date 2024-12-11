import Link from 'next/link'
import { Suspense } from 'react'
import {
    BadgeDollarSign,
    ClipboardList,
    HandCoins,
    Home,
    ImageIcon,
    Layers,
    Mail,
    User,
    ChevronUp
} from 'lucide-react'

import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'

import { FullLogo, IconLogo } from '~/components/ui/logo'
import {
    SidebarProvider,
    Sidebar,
    SidebarTrigger,
    SidebarFooter,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarHeader,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarGroupLabel
} from '~/components/ui/sidebar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { get_dashboard_links } from '~/server/actions/stripe'
import { DashboardBreadcrumbs } from './breadcrumbs'
import { Separator } from '~/components/ui/separator'

export const metadata = {
    title: 'Nemu | Artist Dashboard'
}

const fetch_dashboard_links = unstable_cache(
    async (user_id: string | undefined) => {
        if (!user_id) {
            return undefined
        }

        return await get_dashboard_links(user_id)
    },
    ['dashboard_links'],
    { tags: ['dashboard_links'], revalidate: 3600 }
)

const sidebar_items = [
    {
        title: 'Home',
        href: '/dashboard',
        icon: <Home className="h-6 w-6" />
    },
    {
        title: 'Commissions',
        href: '/dashboard/commissions',
        icon: <Layers className="h-6 w-6" />
    },
    {
        title: 'Portfolio',
        href: '/dashboard/portfolio',
        icon: <ImageIcon className="h-6 w-6" />
    },
    {
        title: 'Forms',
        href: '/dashboard/forms',
        icon: <ClipboardList className="h-6 w-6" />
    },
    {
        title: 'Messages',
        href: '/dashboard/messages',
        icon: <Mail className="h-6 w-6" />
    }
]

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <DashboardSidebar />
            <main className="flex min-h-screen w-full flex-col bg-background-secondary">
                <header className="my-3 flex h-10 shrink-0 items-center gap-2">
                    <SidebarTrigger />
                    <Separator orientation="vertical" className="h-1/2" />
                    <DashboardBreadcrumbs />
                </header>
                <div className="mb-3 mr-3 flex-grow rounded-xl bg-background py-5">
                    {children}
                </div>
            </main>
        </SidebarProvider>
    )
}

function DashboardSidebar() {
    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="flex items-center gap-2">
                <div className="group-data-[collapsible=icon]:hidden">
                    <FullLogo />
                </div>
                <div className="group-data-[state=expanded]:hidden">
                    <IconLogo />
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
                        <SidebarMenu>
                            {sidebar_items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild>
                                        <Link prefetch={true} href={item.href}>
                                            {item.icon}
                                            {item.title}
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarGroupLabel>Settings</SidebarGroupLabel>
                        <SidebarSettingsContent />
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <Suspense fallback={<div>Loading...</div>}>
                    <SidebarUserdropdown />
                </Suspense>
            </SidebarFooter>
        </Sidebar>
    )
}

async function SidebarUserdropdown() {
    const clerk_user = await currentUser()

    if (!clerk_user) {
        redirect('/u/login')

        return null
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton>
                            <Avatar className="h-8 w-8">
                                <AvatarImage
                                    src={clerk_user.imageUrl}
                                    alt="Avatar"
                                    className="h-full w-full"
                                />
                                <AvatarFallback>
                                    <User className="h-6 w-6" />
                                </AvatarFallback>
                            </Avatar>
                            {clerk_user.username}
                            <ChevronUp className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="top"
                        className="w-[--radix-popper-anchor-width]"
                    >
                        <DropdownMenuItem asChild>
                            <Link
                                prefetch={true}
                                href={`/@${clerk_user.privateMetadata.handle as string}`}
                            >
                                My Page
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link prefetch={true} href={'/dashboard/settings'}>
                                Artist Settings
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}

async function SidebarSettingsContent() {
    const current_user = await currentUser()
    const dashboard_links = await fetch_dashboard_links(current_user?.id)

    if (!dashboard_links) {
        return null
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton asChild>
                    <Link href={dashboard_links.managment.url}>
                        <HandCoins className="h-6 w-6" />
                        Payout
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton asChild>
                    <Link
                        href={
                            dashboard_links.checkout_portal
                                ? dashboard_links.checkout_portal
                                : '/artists/supporter'
                        }
                    >
                        <BadgeDollarSign className="h-6 w-6" />
                        Supporter
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
