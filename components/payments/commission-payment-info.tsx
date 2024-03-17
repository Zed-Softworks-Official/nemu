import { FormatNumberToCurrency } from '@/core/helpers'

export default function CommissionPaymentInfo({ price }: { price: number }) {
    return (
        <div className='flex flex-col'>
            <span className="text-base-content/80 font-normal text-lg">From</span>
            <p className="font-bold text-xl">{FormatNumberToCurrency(price)}</p>
        </div>
    )
}
