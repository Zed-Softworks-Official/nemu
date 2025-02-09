import {
    AnimatedCommunity,
    AnimatedCTA,
    AnimatedFeatures,
    AnimatedHero,
    AnimatedPricing
} from './animations'

export default function ArtistsPage() {
    return (
        <div className="mx-auto flex flex-col gap-4">
            <AnimatedHero />
            <AnimatedFeatures />
            <AnimatedPricing />
            <AnimatedCommunity />
            <AnimatedCTA />
        </div>
    )
}
