import { Suspense } from 'react'
import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/server'
import RequestTable from './request-table'

export default function RequestsPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const requests = await api.request.get_request_list()

    if (requests.length === 0) {
        return (
            <main className="flex h-full w-full flex-col p-6">
                <div className="flex flex-col items-center justify-center gap-5">
                    <NemuImage src={'/nemu/sad.png'} alt="Sad" width={200} height={200} />
                    <h2 className="text-2xl font-bold">No Requests</h2>
                    <p className="text-base-content/60">You have no requests yet!</p>
                </div>
            </main>
        )
    }

    return <RequestTable requests={requests} />
}
