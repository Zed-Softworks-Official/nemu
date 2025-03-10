import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import Loading from '~/components/ui/loading'

export default function ArtistApplySuccessPage() {
    return (
        <div className="container mx-auto flex max-w-2xl flex-col items-center gap-8 px-4 py-12">
            <div className="flex flex-col items-center justify-center space-y-6">
                <NemuImage
                    src={'/nemu/sparkles.png'}
                    alt="Nemu Excited"
                    width={400}
                    height={400}
                    className="w-64 object-cover"
                />
                <div>
                    <h2 className="text-foreground text-center text-3xl font-bold tracking-tight">
                        Welcome to Nemu!
                    </h2>
                    <p className="text-muted-foreground mt-2 text-center text-sm">
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
        </div>
    )
}

async function ArtistOnboardingButton() {
    return (
        <Button asChild size={'lg'}>
            <Link target="_blank" href={'/dashboard/managment'}>
                Complete Onboarding
            </Link>
        </Button>
    )
}
