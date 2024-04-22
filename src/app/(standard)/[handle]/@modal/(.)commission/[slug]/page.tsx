import CommissionDisplay from '~/components/displays/commission-display'
import ParallelModal from '~/components/ui/parallel-modal'
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
        <ParallelModal>
            <CommissionDisplay commission={commission} session={session} />
        </ParallelModal>
    )
}
