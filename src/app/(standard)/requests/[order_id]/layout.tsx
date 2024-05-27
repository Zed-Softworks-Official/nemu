import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import RequestSidenavLink from '~/components/requests/request-sidenav-link'
import { ClientRequestData } from '~/core/structures'
import { db } from '~/server/db'
import { requests } from '~/server/db/schema'

export const get_request_details = unstable_cache(
    async (order_id: string) => {
        const request = await db.query.requests.findFirst({
            where: eq(requests.order_id, order_id),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                }
            }
        })

        if (!request) {
            return undefined
        }

        const result: ClientRequestData = {
            ...request,
            user: await clerkClient.users.getUser(request.user_id)
        }

        return result
    },
    ['request-details']
)

export default async function Layout({
    children,
    params
}: {
    children: React.ReactNode
    params: { order_id: string }
}) {
    const request = await get_request_details(params.order_id)

    if (!request || !request.commission) {
        return notFound()
    }

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
                            href={`/requests/${params.order_id}/downloads`}
                            path="downloads"
                        >
                            Downloads
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
