import CommissionDisplay from '~/components/displays/commission-display'
import { Dialog, DialogContent } from '~/components/ui/dialog'

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
        <Dialog open>
            <DialogContent className="!max-w-6xl">
                <CommissionDisplay commission={commission} />
            </DialogContent>
        </Dialog>
    )
}
