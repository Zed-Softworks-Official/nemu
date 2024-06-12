import { CalendarIcon, CheckCircleIcon, ClockIcon } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import RoadmapBubble from '~/components/ui/roadmap-bubble'

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
        title: 'Artists Corner',
        description: 'A place to sell ready-made art/assets',
        status: FeatureStatus.InProgress
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
        title: 'Markdown Editor',
        description:
            'Use markdown to create descriptions for artist corner products and commissions',
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
            <section className="w-full pt-12 md:pt-24 lg:pt-32">
                <div className="container space-y-10 px-4 md:px-6 xl:space-y-16">
                    <div className="mx-auto grid max-w-[1300px] gap-4 px-4 sm:px-6 md:grid-cols-2 md:gap-16 md:px-10">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:leading-loose xl:text-[3.4rem] 2xl:text-[3.75rem]">
                                Roadmap for Nemu
                            </h1>
                            <p className="mx-auto max-w-[700px] text-base-content/80 md:text-xl">
                                Discover our planned features and milestones for the
                                future of our marketplace.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="divider"></div>
            </section>
            <main className="flex-1">
                <section className="w-full py-12 md:py-24 lg:py-32">
                    <div className="container px-4 md:px-6">
                        <div className="grid gap-10 sm:px-10 md:grid-cols-1 md:gap-16">
                            <div className="space-y-4">
                                <Badge className="badge-lg rounded-xl">Roadmap</Badge>
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
        <div className="grid grid-cols-[40px_1fr] items-start gap-4">
            <RoadmapBubble />
            <div>
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
                <div className="inline-flex items-center gap-2 text-sm font-medium text-warning">
                    <ClockIcon className="h-4 w-4" />
                    In Progress
                </div>
            )
        case FeatureStatus.Completed:
            return (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-success">
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
