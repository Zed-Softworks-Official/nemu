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
    PanelLeftIcon,
    User,
    CogIcon,
    ChevronUp
} from 'lucide-react'

import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import Logo from '~/components/ui/logo'
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

export const metadata = {
    title: 'Nemu | Artist Dashboard'
}

const sidebar_items = [
    {
        title: 'Dashboard',
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
            <main>
                <SidebarTrigger />
            </main>
        </SidebarProvider>
    )
}

function DashboardSidebar() {
    return (
        <Sidebar>
            <SidebarHeader className="flex items-center gap-2">
                <Logo />
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
                    <Link href={'/artists/supporter'}>
                        <BadgeDollarSign className="h-6 w-6" />
                        Become a Supporter
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}

// async function SidebarContent() {
//     const clerk_user = await currentUser()

//     if (!clerk_user) {
//         return redirect('/u/login')
//     }

//     const artist = await db.query.artists.findFirst({
//         where: eq(artists.id, clerk_user.publicMetadata.artist_id as string)
//     })

//     if (!artist) {
//         return redirect('/u/login')
//     }

//     const dashboard_links = await api.stripe.get_dashboard_links()

//     if (!dashboard_links) {
//         return redirect('/u/login')
//     }

//     return (
//         <>
//             <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
//                 <SidebarItem
//                     icon={<HomeIcon className="h-6 w-6" />}
//                     title="Home"
//                     href="/dashboard"
//                     // path="home"
//                 />
//                 <SidebarItem
//                     icon={<LayersIcon className="h-6 w-6" />}
//                     title="Commissions"
//                     href="/dashboard/commissions"
//                 />
//                 <SidebarItem
//                     icon={<ImageIcon className="h-6 w-6" />}
//                     title="Portfolio"
//                     href="/dashboard/portfolio"
//                 />
//                 <SidebarItem
//                     icon={<ClipboardListIcon className="h-6 w-6" />}
//                     title="Forms"
//                     href="/dashboard/forms"
//                 />
//                 <SidebarItem
//                     icon={<MailIcon className="h-6 w-6" />}
//                     title="Messages"
//                     href="/dashboard/messages"
//                 />
//             </nav>
//             <nav className="mt-auto flex flex-col items-center gap-4 px-2 sm:py-5">
//                 <SidebarItem
//                     icon={<BrushIcon className="h-6 w-6" />}
//                     title="My Page"
//                     href={`/@${artist.handle}`}
//                 />
//                 <SidebarItem
//                     icon={<HandCoinsIcon className="h-6 w-6" />}
//                     title={
//                         dashboard_links.managment.type === 'onboarding'
//                             ? 'Complete Onboarding'
//                             : 'Payout'
//                     }
//                     href={dashboard_links.managment.url}
//                 />
//                 <SidebarItem
//                     icon={<BadgeDollarSign className="h-6 w-6" />}
//                     title="Supporter"
//                     href={
//                         dashboard_links.checkout_portal
//                             ? dashboard_links.checkout_portal
//                             : '/artists/supporter'
//                     }
//                 />
//                 <Tooltip>
//                     <TooltipTrigger asChild>
//                         <DropdownMenu>
//                             <DropdownMenuTrigger asChild>
//                                 <Avatar>
//                                     <AvatarImage src={clerk_user.imageUrl} alt="Avatar" />
//                                     <AvatarFallback>
//                                         <UserIcon className="h-6 w-6" />
//                                     </AvatarFallback>
//                                 </Avatar>
//                             </DropdownMenuTrigger>
//                             <DropdownMenuContent side="right" sideOffset={5}>
//                                 <DropdownMenuItem>
//                                     <Link
//                                         href={'/u/account'}
//                                         className="flex flex-row items-center gap-3"
//                                     >
//                                         <UserIcon className="h-6 w-6" />
//                                         Account Settings
//                                     </Link>
//                                 </DropdownMenuItem>
//                                 <DropdownMenuItem>
//                                     <Link
//                                         href={'/dashboard/settings'}
//                                         className="flex flex-row items-center gap-3"
//                                     >
//                                         <CogIcon className="h-6 w-6" />
//                                         Artist Settings
//                                     </Link>
//                                 </DropdownMenuItem>
//                             </DropdownMenuContent>
//                         </DropdownMenu>
//                     </TooltipTrigger>
//                     <TooltipContent side="right" sideOffset={5}>
//                         Account
//                     </TooltipContent>
//                 </Tooltip>
//             </nav>
//         </>
//     )
// }

// function SidebarItem({
//     title,
//     href,
//     icon
// }: {
//     title: string
//     href: string
//     icon: React.ReactNode
// }) {
//     return (
//         <Tooltip>
//             <TooltipTrigger asChild>
//                 <Link href={href} className={'btn btn-ghost'}>
//                     {icon}
//                 </Link>
//             </TooltipTrigger>
//             <TooltipContent side="right" sideOffset={5}>
//                 {title}
//             </TooltipContent>
//         </Tooltip>
//     )
// }
