import { notFound } from 'next/navigation'
import { RequestContent } from '~/core/structures'
import { api } from '~/trpc/server'

export default async function Layout({
    children,
    params
}: {
    children: React.ReactNode
    params: { order_id: string }
}) {
    const request = await api.requests.get_request_client(params.order_id)

    if (!request || !request.commission) {
        return notFound()
    }

    const request_data = request.content as RequestContent

    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <main className="flex min-h-screen flex-1 flex-col gap-5 bg-base-100 p-5 md:gap-8 md:p-10">
                <div className="mx-auto grid w-full max-w-6xl gap-2">
                    <div className="flex flex-col gap-2 pb-10">
                        <h1 className="text-3xl font-bold">My Request</h1>
                    </div>
                    <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
                        <nav className="grid gap-4 text-sm text-base-content/80">
                            <span className="font-semibold text-primary">
                                Request Details
                            </span>
                            <span>Messages</span>
                            <span>Downloads</span>
                            <span>Invoices</span>
                        </nav>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}
