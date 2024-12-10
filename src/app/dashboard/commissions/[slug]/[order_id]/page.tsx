import { Separator } from '~/components/ui/separator'
import { CommissionDetails, CommissionHeader } from './details'

export default async function CommissionRequestOrderPage(props: {
    params: Promise<{ slug: string; order_id: string }>
}) {
    const params = await props.params

    return (
        <div className="container mx-auto">
            <CommissionHeader order_id={params.order_id} />
            <Separator className="my-5" />

            <CommissionDetails order_id={params.order_id} />
        </div>
    )
}
