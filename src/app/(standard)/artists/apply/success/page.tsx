import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/server'

export default function ArtistApplySuccessPage() {
    return (
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-6 md:grid-cols-2 lg:gap-12">
            <div className="flex flex-col items-center justify-center space-y-8 rounded-l-xl bg-background-secondary p-6">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
                        Welcome to Nemu!
                    </h2>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                        We&apos;re so excited to have you on board! Make sure to complete
                        the onboarding process so you can start selling your art!
                    </p>
                </div>
                <div className="flex w-full items-center justify-center">
                    <Suspense fallback={<Loading />}>
                        <ArtistOnboardingButton />
                    </Suspense>
                </div>
            </div>
            <div className="flex items-center justify-center">
                <NemuImage
                    src={'/nemu/sparkles.png'}
                    alt="Nemu Excited"
                    width={800}
                    height={800}
                    className="w-full object-cover"
                />
            </div>
        </div>
    )
}

async function ArtistOnboardingButton() {
    const dashboard_links = await api.stripe.get_dashboard_links()

    return (
        <Button asChild size={'lg'}>
            <Link target="_blank" href={dashboard_links?.managment.url ?? '/dashboard'}>
                Complete Onboarding
            </Link>
        </Button>
    )
}
