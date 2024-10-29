import Link from 'next/link'
import { Suspense } from 'react'
import {
    BadgeDollarSign,
    BrushIcon,
    ClipboardList,
    HandCoins,
    Home,
    ImageIcon,
    Layers,
    Mail,
    User,
    CogIcon,
    ChevronUp
} from 'lucide-react'

import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import Logo, { IconLogo } from '~/components/ui/logo'
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
import DashboardBreadcrumbs from '~/components/dashboard/header-breadcrumbs'

export const metadata = {
    title: 'Nemu | Artist Dashboard'
}

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
            <main className="w-full">
                <div className="flex flex-row items-center gap-5 pl-4">
                    <SidebarTrigger />
                    <DashboardBreadcrumbs />
                </div>
                {children}
            </main>
        </SidebarProvider>
    )
}

function DashboardSidebar() {
    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="flex items-center gap-2">
                <div className="group-data-[collapsible=icon]:hidden">
                    <Logo />
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
                                        <Link href={item.href}>
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
                                <AvatarImage src={clerk_user.imageUrl} alt="Avatar" />
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
                        <DropdownMenuItem>
                            <span>My Page</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <span>Artist Settings</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}

async function SidebarSettingsContent() {
    // TODO: Use caching for these links
    const dashboard_links = await get_dashboard_links()

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
