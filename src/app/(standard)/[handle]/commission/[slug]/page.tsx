import CommissionDisplay from '~/components/displays/commission-display'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function CommissionsPage({
    params
}: {
    params: { handle: string; slug: string }
}) {
    const session = await getServerAuthSession()

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
                <CommissionDisplay commission={commission} session={session} />
            </div>
        </div>
    )
}
