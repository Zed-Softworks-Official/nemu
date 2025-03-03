import { Separator } from '~/components/ui/separator'
import { CommissionDetails, CommissionDetailsTabs, CommissionHeader } from './details'
import { DashboardOrderProvider } from '~/components/orders/dashboard-order'

export default async function CommissionRequestOrderPage(props: {
    params: Promise<{ slug: string; order_id: string }>
}) {
    const params = await props.params

    return (
        <DashboardOrderProvider orderId={params.order_id}>
            <div className="container mx-auto px-5">
                <CommissionHeader />
                <Separator className="my-5" />

                <CommissionDetails />
                <div className="mt-5 flex flex-col gap-5">
                    <CommissionDetailsTabs />
                </div>
            </div>
        </DashboardOrderProvider>
    )
}
