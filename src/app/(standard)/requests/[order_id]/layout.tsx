import RequestSidenavLink from './sidenav-link'

export default async function Layout(props: {
    children: React.ReactNode
    params: Promise<{ order_id: string }>
}) {
    const params = await props.params

    const { children } = props

    return (
        <main className="bg-base-100 flex min-h-screen flex-1 flex-col gap-5 p-5 md:gap-8 md:p-10">
            <div className="mx-auto grid w-full max-w-6xl gap-2">
                <div className="flex flex-col gap-2 pb-10">
                    <h1 className="text-3xl font-bold">My Request</h1>
                </div>
                <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
                    <nav className="text-base-content/80 grid gap-4 text-sm">
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
                            href={`/requests/${params.order_id}/invoice`}
                            path="invoice"
                        >
                            Invoice
                        </RequestSidenavLink>
                    </nav>
                    {children}
                </div>
            </div>
        </main>
    )
}
