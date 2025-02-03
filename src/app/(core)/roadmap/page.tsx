import { CalendarIcon, CheckCircleIcon, ClockIcon } from 'lucide-react'
import { Separator } from '~/components/ui/separator'

enum FeatureStatus {
    InProgress,
    Completed,
    Planned
}

interface Feature {
    title: string
    description: string
    status: FeatureStatus
}

const features: Feature[] = [
    {
        title: 'Initial Release',
        description: 'A basic version of nemu with a few features',
        status: FeatureStatus.Completed
    },
    {
        title: 'Artist Feedback',
        description: 'A way to give feedback on various aspects of the artist dashboard',
        status: FeatureStatus.InProgress
    },
    {
        title: 'Con Page (Super Secret)',
        description: 'A page for artists to quickly sign up if they attended a con',
        status: FeatureStatus.Planned
    },
    {
        title: 'Markdown Editor',
        description:
            'Use markdown to create descriptions for artist corner products and commissions',
        status: FeatureStatus.Planned
    },
    {
        title: 'Artists Corner',
        description: 'A place to sell ready-made art/assets',
        status: FeatureStatus.Planned
    },

    {
        title: 'Embedded Donations/Tipping',
        description: 'A way to donate to artists directly from the site',
        status: FeatureStatus.Planned
    },
    {
        title: 'Favorites',
        description: 'A way to save artists and their work for later',
        status: FeatureStatus.Planned
    },
    {
        title: 'Reviews',
        description:
            'A way to rate and review artists and their work after purchase/commission has been delievered',
        status: FeatureStatus.Planned
    },
    {
        title: 'The rest is a secret',
        description: 'e he~',
        status: FeatureStatus.Planned
    }
]

export default function RoadmapPage() {
    return (
        <div className="flex min-h-[100dvh] flex-col">
            <section className="w-full lg:pb-12">
                <div className="container space-y-10 xl:space-y-16">
                    <div className="mx-auto grid gap-4 md:grid-cols-2 md:gap-16">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:leading-loose xl:text-[3.4rem] 2xl:text-[3.75rem]">
                                Roadmap for Nemu
                            </h1>
                            <p className="mx-auto text-muted-foreground md:text-xl">
                                Discover our planned features and milestones for the
                                future of our marketplace.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
            <Separator />
            <main className="flex-1">
                <section className="w-full py-12">
                    <div className="container px-4 md:px-6">
                        <div className="grid gap-10 sm:px-10 md:grid-cols-1 md:gap-16">
                            <div className="space-y-4">
                                <div className="grid gap-6">
                                    {features.map((feature) => (
                                        <FeatureCard
                                            key={feature.title}
                                            feature={feature}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}

function FeatureCard(props: { feature: Feature }) {
    return (
        <div className="grid items-start gap-4">
            <div className="w-full">
                <h3 className="text-lg font-bold">{props.feature.title}</h3>
                <p className="text-base-content/80">{props.feature.description}</p>
                <FeatureStatusBadge status={props.feature.status} />{' '}
            </div>
        </div>
    )
}

function FeatureStatusBadge(props: { status: FeatureStatus }) {
    switch (props.status) {
        case FeatureStatus.InProgress:
            return (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-yellow-400">
                    <ClockIcon className="h-4 w-4" />
                    In Progress
                </div>
            )
        case FeatureStatus.Completed:
            return (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-green-400">
                    <CheckCircleIcon className="h-4 w-4" />
                    Completed
                </div>
            )
        case FeatureStatus.Planned:
            return (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                    <CalendarIcon className="h-4 w-4" />
                    Planned
                </div>
            )
    }
}
