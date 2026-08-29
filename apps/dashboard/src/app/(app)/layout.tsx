import { auth } from '@clerk/nextjs/server'
import { SidebarInset, SidebarProvider } from '@nemu/ui/components/sidebar'
import { Header } from '~/components/header/header'
import { PairingGate } from '~/components/pairing-gate'
import { AppSidebar } from '~/components/sidebar/app-sidebar'
import { SignedOutRedirect } from '~/components/signed-out-redirect'

export default async function AppLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    await auth.protect()

    return (
        <SignedOutRedirect>
            <PairingGate>
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
                        <Header />
                        <div className="flex flex-1 flex-col p-5">
                            {children}
                        </div>
                    </SidebarInset>
                </SidebarProvider>
            </PairingGate>
        </SignedOutRedirect>
    )
}
