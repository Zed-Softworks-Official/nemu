import { FormatNumberToCurrency } from '@/core/helpers'
import { cn } from '@/lib/utils'
import { CheckCircle, CheckCircle2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import Link from 'next/link'

export default function PricingCard({
    title,
    price,
    features,
    checkout_link
}: {
    title: string
    price: number
    features: { title: string; include: boolean; tooltip?: string }[]
    checkout_link?: string
}) {
    return (
        <div className="card bg-base-200 shadow-xl w-[21rem]">
            <div className="card-body">
                <h2 className="text-3xl font-bold">{title}</h2>
                <div className="divider"></div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-4xl">
                        {FormatNumberToCurrency(price)}
                    </span>

                    <div className="text-base-content/80 font-normal text-sm flex flex-col">
                        <span className="-mb-2">per</span>
                        <span>month</span>
                    </div>
                </div>
                <div className="divider"></div>
                <div className="flex flex-col h-full">
                    {features.map((feature) => (
                        <div
                            className={cn(
                                'hover:bg-base-100 p-5 rounded-xl',
                                feature.tooltip && 'tooltip'
                            )}
                            data-tip={feature.tooltip}
                        >
                            <div className="flex gap-5 items-center">
                                {feature.include ? (
                                    <CheckCircle className="w-6 h-6 text-primary" />
                                ) : (
                                    <XCircleIcon className="w-6 h-6 text-error" />
                                )}
                                {feature.title}
                            </div>
                        </div>
                    ))}
                </div>
                {checkout_link && (
                <div className='flex items-end'>
                    <div className="divider"></div>
                    <Link href={checkout_link} className="btn btn-primary w-full">
                        Become a supporter
                    </Link>
                </div>
            )}
            </div>
            
        </div>
    )
}
