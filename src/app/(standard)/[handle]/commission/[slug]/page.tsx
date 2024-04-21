import CommissionDisplay from '~/components/displays/commission-display'
import { api } from '~/trpc/server'

export default async function CommissionsPage({
    params
}: {
    params: { handle: string; slug: string }
}) {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const commission = await api.commission.get_commission({
        handle: handle,
        slug: params.slug,
        req_data: {
            artist: true
        }
    })

    return (
        <div className="card bg-base-300 shadow-xl">
            <div className="card-body">
                <CommissionDisplay commission={commission} />
            </div>
        </div>
    )
}
