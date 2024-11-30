import { CommissionHeader } from './details'

export default async function CommissionRequestOrderPage(props: {
    params: Promise<{ slug: string; order_id: string }>
}) {
    const params = await props.params

    return (
        <div className="container mx-auto">
            <CommissionHeader order_id={params.order_id} />
        </div>
    )
}
