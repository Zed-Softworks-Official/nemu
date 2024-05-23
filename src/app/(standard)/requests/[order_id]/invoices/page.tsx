import { Badge } from '~/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { format_to_currency } from '~/lib/utils'
import { api } from '~/trpc/server'

export default async function RequestInvoicesPage({
    params
}: {
    params: { order_id: string }
}) {
    const invoice = await api.requests.get_request_invoice(params.order_id)

    if (!invoice) {
        return <>No Invoice</>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Invoice</CardTitle>
                <Badge variant={'warning'}>{invoice.status}</Badge>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="table table-zebra">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Description</th>
                                <th>Price</th>
                                <th>Quantity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.invoice_items.map((item, index) => (
                                <tr key={item.id}>
                                    <th>{index + 1}</th>
                                    <td>{item.name}</td>
                                    <td>{item.price}</td>
                                    <td>{item.quantity}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="divider"></div>
                    <div className="stats w-full shadow">
                        <div className="stat">
                            <div className="stat-title">Total</div>
                            <div className="stat-value">
                                {format_to_currency(Number(invoice.total))}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
