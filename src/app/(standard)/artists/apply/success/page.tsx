import { currentUser } from '@clerk/nextjs/server'
import Link from 'next/link'
import { Suspense } from 'react'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { api } from '~/trpc/server'

import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'

export default function ArtistApplySuccessPage() {
    return (
        <div className="card bg-base-300 py-24 shadow-xl sm:py-32">
            <div className="card-body">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-5 sm:text-center">
                        <NemuImage
                            src={'/nemu/sparkles.png'}
                            alt="Nemu Excited"
                            width={200}
                            height={200}
                            priority
                        />
                        <h2 className="text-3xl font-bold tracking-tight text-base-content sm:text-4xl">
                            Welcome to Nemu!
                        </h2>
                        <p className="mt-6 text-lg leading-8 text-base-content/80">
                            We&apos;re so excited to have you on board! Make sure to
                            complete the onboarding process so you can start selling your
                            art!
                        </p>
                        <div className="divider"></div>
                        <div className="flex w-full items-center justify-center gap-5">
                            <Suspense fallback={<Loading />}>
                                <ArtistOnboardingButton />
                            </Suspense>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

async function ArtistOnboardingButton() {
    const user = await currentUser()

    if (!user) {
        return null
    }

    const artist = await db.query.artists.findFirst({
        where: eq(artists.user_id, user.id)
    })

    if (!artist) {
        return null
    }

    const dashboard_links = await api.stripe.get_dashboard_links()

    return (
        <Link
            href={dashboard_links?.managment.url ?? '/dashboard'}
            className="btn btn-primary btn-wide mt-10 text-white"
        >
            Complete Onboarding
        </Link>
    )
}
