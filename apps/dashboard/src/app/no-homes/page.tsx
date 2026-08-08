'use client'

import thisIsFine from '@nemu/assets/emotes/this-is-fine.png'
import { Button } from '@nemu/ui/components/button'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function NoHomesPage() {
    const router = useRouter()

    return (
        <main className="flex min-h-svh flex-col items-center justify-center bg-background p-6">
            <div className="flex w-full max-w-md flex-col items-center text-center">
                <Image
                    alt="Nemu sitting calmly while everything burns"
                    className="mb-8 h-auto w-56"
                    height={280}
                    priority
                    src={thisIsFine}
                    width={280}
                />
                <h1 className="font-bold text-2xl tracking-tight">
                    Couldn&apos;t find any paired homes
                </h1>
                <p className="mt-3 text-muted-foreground text-sm">
                    We couldn&apos;t reach a controller on your network or
                    through the cloud, and pairing couldn&apos;t be confirmed.
                </p>
                <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => router.replace('/')} type="button">
                        Try again
                    </Button>
                    <Button
                        onClick={() => router.replace('/setup')}
                        type="button"
                        variant="outline"
                    >
                        Set up a home
                    </Button>
                </div>
            </div>
        </main>
    )
}
