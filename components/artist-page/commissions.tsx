import CommissionCard from './commission-card'
import { CommissionItem } from '@/core/structures'

export default function Commissions({
    commissions,
    handle,
    terms
}: {
    commissions: CommissionItem[]
    handle: string
    terms: string
}) {
    return (
        <div className="flex flex-col gap-5">
            {commissions?.map((commission) => (
                <CommissionCard
                    key={commission.title}
                    handle={handle}
                    commission={commission}
                    terms={terms}
                />
            ))}
        </div>
    )
}
