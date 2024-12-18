import { Separator } from '~/components/ui/separator'
import { CommissionDetails, CommissionDetailsTabs, CommissionHeader } from './details'
import { OrderProvider } from '~/components/order-provider'

export default async function CommissionRequestOrderPage(props: {
    params: Promise<{ slug: string; order_id: string }>
}) {
    const params = await props.params

    return (
        <OrderProvider order_id={params.order_id}>
            <div className="container mx-auto px-5">
                <CommissionHeader />
                <Separator className="my-5" />

                <CommissionDetails />
                <div className="mt-5 flex flex-col gap-5">
                    <CommissionDetailsTabs />
                </div>
            </div>
        </OrderProvider>
    )
}
