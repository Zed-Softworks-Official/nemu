import { HomeCarousel } from './carousel'
import { RandomCommissions } from './commissions'

export default function HomePage() {
    return (
        <div className="container mx-auto">
            <HomeCarousel />
            <RandomCommissions />
        </div>
    )
}
