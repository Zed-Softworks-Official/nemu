import { CheckCircleIcon } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import SupporterButton from './supporter-button'
import { Separator } from '~/components/ui/separator'

const includedFeatures = ['0% Platform Fees', 'Fund Nemu Development', 'More Coming Soon']

export default function GetSupporterPage() {
    return (
        <div className="py-24 sm:py-32">
            <div className="card-body">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="mx-auto max-w-2xl sm:text-center">
                        <h2 className="text-base-content text-3xl font-bold tracking-tight sm:text-4xl">
                            Become A Supporter
                        </h2>
                        <p className="mt-6 text-lg leading-8 text-muted-foreground">
                            As a supporter, you&apos;ll be able to reduce Nemu&apos;s
                            platform fees to 0%. Becoming a supporter is a fantastic way
                            to help fund the development of Nemu.
                        </p>
                    </div>
                    <div className="mx-auto mt-16 max-w-2xl rounded-3xl ring-1 ring-background-tertiary sm:mt-20 lg:mx-0 lg:flex lg:max-w-none">
                        <div className="p-8 sm:p-10 lg:flex-auto">
                            <h3 className="text-base-content text-2xl font-bold tracking-tight">
                                Supporter Membership
                            </h3>
                            <p className="text-base-content/80 mt-6 text-base leading-7">
                                As of now, supporters only reduce the platform fees to 0%
                                and help fund the development of Nemu. We&apos;re working
                                on adding more features to the supporter membership, so
                                stay tuned!
                            </p>
                            <Separator className="my-5" />
                            <div className="text-primary">What&apos;s included</div>
                            <ul
                                role="list"
                                className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-muted-foreground sm:grid-cols-2 sm:gap-6"
                            >
                                {includedFeatures.map((feature) => (
                                    <li key={feature} className="flex gap-x-3">
                                        <CheckCircleIcon
                                            className="h-6 w-5 flex-none text-primary"
                                            aria-hidden="true"
                                        />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="-mt-2 p-2 lg:mt-0 lg:w-full lg:max-w-md lg:flex-shrink-0">
                            <div className="rounded-2xl bg-background-secondary py-10 text-center ring-1 ring-inset ring-gray-900/5 lg:flex lg:flex-col lg:justify-center lg:py-16">
                                <div className="mx-auto max-w-xs px-8">
                                    <Tabs defaultValue="monthly">
                                        <TabsList className="mb-6">
                                            <TabsTrigger value="monthly">
                                                Monthly
                                            </TabsTrigger>
                                            <TabsTrigger value="annual">
                                                Annual
                                            </TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="monthly">
                                            <p className="my-6 flex items-baseline justify-center gap-x-2">
                                                <span className="text-5xl font-bold tracking-tight text-foreground">
                                                    $6
                                                </span>
                                                <span className="text-sm font-semibold leading-6 tracking-wide text-muted-foreground">
                                                    /month
                                                </span>
                                            </p>
                                            <SupporterButton term="monthly" />
                                            <p className="mt-6 text-xs leading-5 text-muted-foreground/60">
                                                Invoices and receipts available for easy
                                                company reimbursement
                                            </p>
                                        </TabsContent>
                                        <TabsContent value="annual">
                                            <p className="my-6 flex items-baseline justify-center gap-x-2">
                                                <span className="text-base-content text-5xl font-bold tracking-tight">
                                                    $57.60
                                                </span>
                                                <span className="text-sm font-semibold leading-6 tracking-wide text-muted-foreground">
                                                    /year
                                                </span>
                                            </p>
                                            <SupporterButton term="annual" />
                                            <p className="mt-6 text-xs leading-5 text-muted-foreground/60">
                                                Invoices and receipts available for easy
                                                company reimbursement
                                            </p>
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
