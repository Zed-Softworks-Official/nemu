import DefaultPageLayout from '@/app/(default)/layout'
import PricingCard from '@/components/ui/pricing-card'
import { getServerAuthSession } from '@/core/auth'
import { api } from '@/core/api/server'
import Link from 'next/link'

const free_tier = [
    {
        title: 'Access to Commissions',
        include: true
    },
    {
        title: "Access to Artist's corner",
        include: true
    },
    {
        title: 'Access to Messages',
        include: true
    },
    {
        title: 'Access to Kanban',
        include: true
    },
    {
        title: '0% platform fees',
        include: false
    }
]

const supporter_tier = [
    {
        title: 'Everything in the free tier',
        include: true
    },
    {
        title: '0% platform fees',
        include: true
    }
]

export default async function SupporterPage() {
    const session = await getServerAuthSession()

    return (
        <DefaultPageLayout>
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body">
                    <h1>Become A Supporter</h1>
                    <div className="divider"></div>
                    <div className="max-w-6xl mx-auto">
                        <div className="flex w-full gap-5">
                            <PricingCard title="Free" price={0} features={free_tier} />
                            <PricingCard
                                title="Supporter"
                                price={6}
                                features={supporter_tier}
                                checkout_link={
                                    session
                                        ? `/api/stripe/${session.user.id}/supporter/monthly`
                                        : undefined
                                }
                            />
                        </div>
                    </div>
                </div>
            </div>
        </DefaultPageLayout>
    )
}
