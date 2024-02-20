export default function CommissionPaymentInfo({
    price,
    use_invoicing
}: {
    price: number
    use_invoicing: boolean
}) {
    return (
        <>
            {use_invoicing ? (
                <p className="font-bold text-2xl">Invoice Based</p>
            ) : (
                <p className="font-bold text-2xl">${price}</p>
            )}
        </>
    )
}
