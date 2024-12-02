import ParallelModal from '~/components/ui/parallel-modal'
import { CommissionView } from '~/app/(standard)/[handle]/commission-view'

export default async function CommissionModal(props: {
    params: Promise<{ handle: string; slug: string }>
}) {
    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <ParallelModal>
            <CommissionView handle={handle} slug={params.slug} />
        </ParallelModal>
    )
}
