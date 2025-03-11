import Link from 'next/link'
import { Suspense } from 'react'
import {
    ClipboardList,
    HandCoins,
    Home,
    ImageIcon,
    Layers,
    Mail,
    User,
    ChevronUp,
    Store,
    Crown
} from 'lucide-react'

import { currentUser } from '@clerk/nextjs/server'
import { RedirectToSignIn } from '@clerk/nextjs'

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
    SidebarGroupLabel,
    SidebarInset
} from '~/components/ui/sidebar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { DashboardBreadcrumbs } from './breadcrumbs'
import { Separator } from '~/components/ui/separator'

export const metadata = {
    title: 'Nemu | Artist Dashboard'
}

const sidebar_items = [
    {
        title: 'Home',
        href: '/dashboard',
        icon: <Home className="size-6" />
    },
    {
        title: 'Commissions',
        href: '/dashboard/commissions',
        icon: <Layers className="size-6" />
    },
    {
        title: 'Artist Corner',
        href: '/dashboard/artist-corner',
        icon: <Store className="size-6" />
    },
    {
        title: 'Portfolio',
        href: '/dashboard/portfolio',
        icon: <ImageIcon className="size-6" />
    },
    {
        title: 'Forms',
        href: '/dashboard/forms',
        icon: <ClipboardList className="size-6" />
    },
    {
        title: 'Messages',
        href: '/dashboard/messages',
        icon: <Mail className="size-6" />
    }
]

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <DashboardSidebar />
            <SidebarInset className="bg-sidebar relative px-4 pb-4">
                <header className="flex h-16 shrink-0 items-center gap-2">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger />
                        <Separator orientation="vertical" className="ml-4 h-4" />
                        <DashboardBreadcrumbs />
                    </div>
                </header>
                <div className="bg-background flex flex-1 rounded-xl p-4">{children}</div>
            </SidebarInset>
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
    const user = await currentUser()

    if (!user) {
        return <RedirectToSignIn redirectUrl={'/u/login'} />
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <Avatar className="h-8 w-8">
                                <AvatarImage
                                    src={user.imageUrl}
                                    alt="Avatar"
                                    className="h-full w-full"
                                />
                                <AvatarFallback>
                                    <User className="h-6 w-6" />
                                </AvatarFallback>
                            </Avatar>
                            {user.username}
                            <ChevronUp className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="top"
                        className="w-(--radix-popper-anchor-width)"
                    >
                        <DropdownMenuItem asChild>
                            <Link
                                prefetch={true}
                                href={`/@${user.publicMetadata.handle as string}`}
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
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton asChild>
                    <Link target="_blank" href={'/dashboard/management'}>
                        <HandCoins className="h-6 w-6" />
                        Payout
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton asChild>
                    <Link href={'/supporter'}>
                        <Crown className="h-6 w-6" />
                        Supporter
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
