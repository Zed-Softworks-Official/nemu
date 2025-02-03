import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { RedirectToSignIn } from '@clerk/nextjs'

import { UserRole } from '~/lib/structures'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider
} from '~/components/ui/sidebar'
import { FullLogo } from '~/components/ui/logo'
import Link from 'next/link'
import { ArrowLeft, Code, Check } from 'lucide-react'

const sidebar_items = [
    {
        title: 'Artist Code',
        href: '/admin/gen-code',
        icon: <Code className="h-6 w-6" />
    },
    {
        title: 'Verify Artist',
        href: '/admin/verify-artist',
        icon: <Check className="h-6 w-6" />
    }
]

export default async function AdminLayout(props: { children: React.ReactNode }) {
    const user = await currentUser()

    if (!user) {
        return <RedirectToSignIn />
    }

    if (user.publicMetadata.role !== UserRole.Admin) {
        return redirect('/')
    }

    return (
        <SidebarProvider>
            <AdminSidebar />
            <SidebarInset className="px bg-background-secondary p-2">
                <div className="flex flex-1 rounded-xl bg-background p-4">
                    {props.children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}

function AdminSidebar() {
    return (
        <Sidebar>
            <SidebarHeader>
                <FullLogo />
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Artist</SidebarGroupLabel>
                    <SidebarGroupContent>
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
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/">
                                <ArrowLeft className="size-4" />
                                Back To Nemu
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}
