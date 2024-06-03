import RequestSidenavLink from '~/components/requests/request-sidenav-link'

export default async function Layout({
    children,
    params
}: {
    children: React.ReactNode
    params: { order_id: string }
}) {
    return (
        <main className="flex min-h-screen flex-1 flex-col gap-5 bg-base-100 p-5 md:gap-8 md:p-10">
            <div className="mx-auto grid w-full max-w-6xl gap-2">
                <div className="flex flex-col gap-2 pb-10">
                    <h1 className="text-3xl font-bold">My Request</h1>
                </div>
                <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
                    <nav className="grid gap-4 text-sm text-base-content/80">
                        <RequestSidenavLink
                            href={`/requests/${params.order_id}/details`}
                            path="details"
                        >
                            Request Details
                        </RequestSidenavLink>
                        <RequestSidenavLink
                            href={`/requests/${params.order_id}/messages`}
                            path="messages"
                        >
                            Messages
                        </RequestSidenavLink>
                        <RequestSidenavLink
                            href={`/requests/${params.order_id}/delivery`}
                            path="delivery"
                        >
                            Delivery
                        </RequestSidenavLink>
                        <RequestSidenavLink
                            href={`/requests/${params.order_id}/invoices`}
                            path="invoices"
                        >
                            Invoices
                        </RequestSidenavLink>
                    </nav>
                    {children}
                </div>
            </div>
        </main>
    )
}
