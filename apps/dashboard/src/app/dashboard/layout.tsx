import { SidebarInset, SidebarProvider } from '@nemu/ui/components/sidebar'
import { AppSidebar } from '~/components/sidebar/app-sidebar'

export default function DashboardLayout(props: { children: React.ReactNode }) {
    return (
        <SidebarProvider
            style={
                {
                    '--sidebar-width': 'calc(var(--spacing) * 72)',
                    '--header-height': 'calc(var(--spacing) * 12)',
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" />
            <SidebarInset>
                <div className="flex flex-1 flex-col">{props.children}</div>
            </SidebarInset>
        </SidebarProvider>
    )
}
