import { Logo } from '@nemu/ui/components/logo'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
} from '@nemu/ui/components/sidebar'
import Link from 'next/link'
import { NavMain } from './nav-main'
import { NavUser } from './nav-user'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar collapsible="offcanvas" {...props}>
            <SidebarHeader className="px-4 py-4">
                <Link
                    className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    href="/dashboard"
                >
                    <Logo className="h-8 w-auto" height={32} />
                </Link>
            </SidebarHeader>
            <SidebarContent>
                <NavMain />
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    )
}
