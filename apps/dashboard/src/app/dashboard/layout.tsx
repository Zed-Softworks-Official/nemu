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
            <SidebarInset className="md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-3 md:peer-data-[variant=inset]:m-3 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border md:peer-data-[variant=inset]:shadow-lg">
                <div className="flex flex-1 flex-col p-5">{props.children}</div>
            </SidebarInset>
        </SidebarProvider>
    )
}
