import { HydrateClient } from '~/trpc/server'
import Details from './details'

export default function DetailsPage() {
    return (
        <HydrateClient>
            <Details />
        </HydrateClient>
    )
}
