import { CalendarIcon, CheckCircleIcon, ClockIcon } from 'lucide-react'

export default function RoadmapPage() {
    return (
        <div className="flex min-h-[100dvh] flex-col">
            <section className="w-full border-b pt-12 md:pt-24 lg:pt-32">
                <div className="container space-y-10 px-4 md:px-6 xl:space-y-16">
                    <div className="mx-auto grid max-w-[1300px] gap-4 px-4 sm:px-6 md:grid-cols-2 md:gap-16 md:px-10">
                        <div>
                            <h1 className="lg:leading-tighter text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl xl:text-[3.4rem] 2xl:text-[3.75rem]">
                                Roadmap for Our Marketplace
                            </h1>
                            <p className="mx-auto max-w-[700px] text-gray-500 dark:text-gray-400 md:text-xl">
                                Discover our planned features and milestones for the
                                future of our marketplace.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
            <main className="flex-1">
                <section className="w-full py-12 md:py-24 lg:py-32">
                    <div className="container px-4 md:px-6">
                        <div className="grid gap-10 sm:px-10 md:grid-cols-1 md:gap-16">
                            <div className="space-y-4">
                                <div className="inline-block rounded-lg bg-base-300 px-3 py-1 text-sm">
                                    Roadmap
                                </div>
                                <div className="grid gap-6">
                                    <div className="grid grid-cols-[40px_1fr] items-start gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-gray-500/20 dark:border-gray-400/20" />
                                            <div className="z-10 aspect-square w-5 rounded-full bg-gray-900 dark:bg-gray-50" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                Seller Dashboard
                                            </h3>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                Implement a comprehensive seller dashboard
                                                with features like inventory management,
                                                order tracking, and analytics.
                                            </p>
                                            <div className="inline-flex items-center gap-2 text-sm font-medium text-green-500">
                                                <CheckCircleIcon className="h-4 w-4" />
                                                Completed
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[40px_1fr] items-start gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-gray-500/20 dark:border-gray-400/20" />
                                            <div className="z-10 aspect-square w-5 rounded-full bg-gray-900 dark:bg-gray-50" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                Buyer Profiles
                                            </h3>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                Introduce buyer profiles with personalized
                                                recommendations and wishlist
                                                functionality.
                                            </p>
                                            <div className="inline-flex items-center gap-2 text-sm font-medium text-orange-500">
                                                <ClockIcon className="h-4 w-4" />
                                                In Progress
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[40px_1fr] items-start gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-gray-500/20 dark:border-gray-400/20" />
                                            <div className="z-10 aspect-square w-5 rounded-full bg-gray-900 dark:bg-gray-50" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                Loyalty Program
                                            </h3>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                Develop a loyalty program to reward
                                                frequent buyers with exclusive discounts
                                                and perks.
                                            </p>
                                            <div className="inline-flex items-center gap-2 text-sm font-medium text-blue-500">
                                                <CalendarIcon className="h-4 w-4" />
                                                Planned
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[40px_1fr] items-start gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-gray-500/20 dark:border-gray-400/20" />
                                            <div className="z-10 aspect-square w-5 rounded-full bg-gray-900 dark:bg-gray-50" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                Marketplace Analytics
                                            </h3>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                Implement advanced analytics to provide
                                                sellers with insights into market trends,
                                                customer behavior, and sales performance.
                                            </p>
                                            <div className="inline-flex items-center gap-2 text-sm font-medium text-blue-500">
                                                <CalendarIcon className="h-4 w-4" />
                                                Planned
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[40px_1fr] items-start gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-gray-500/20 dark:border-gray-400/20" />
                                            <div className="z-10 aspect-square w-5 rounded-full bg-gray-900 dark:bg-gray-50" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                Automated Shipping
                                            </h3>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                Integrate with shipping providers to offer
                                                automated order fulfillment and tracking
                                                for sellers.
                                            </p>
                                            <div className="inline-flex items-center gap-2 text-sm font-medium text-blue-500">
                                                <CalendarIcon className="h-4 w-4" />
                                                Planned
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}
