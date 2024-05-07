import NemuImage from '~/components/nemu-image'
import { api } from '~/trpc/server'

export default async function RequestsPage() {
    const requests = await api.requests.get_user_request_list()

    if (requests.length === 0) {
        return (
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">Requests</h2>
                    <div className="divider"></div>
                    <div className="flex flex-col items-center justify-center gap-5">
                        <NemuImage
                            src={'/nemu/sad.png'}
                            alt="Sad"
                            width={200}
                            height={200}
                        />
                        <h2 className="text-2xl font-bold">No Requests</h2>
                        <p className="text-base-content/60">You have no requests yet!</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="card bg-base-300 shadow-xl">
            <div className="card-body">
                <h2 className="card-title">Requests</h2>
                <div className="divider"></div>
            </div>
        </div>
    )
}
