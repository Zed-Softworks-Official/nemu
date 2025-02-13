import { HomeCarousel } from './carousel'
import { InfiniteCommissions } from './commissions'

export default function HomePage() {
    return (
        <div className="container mx-auto">
            <HomeCarousel />
            <InfiniteCommissions />
        </div>
    )
}
