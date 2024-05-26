'use client'

import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { nemu_toast } from '~/lib/utils'

export default function UpdateAlgoliaButtons() {
    const artist_mutation = api.algolia.load_artists.useMutation({})
    const commmission_mutation = api.algolia.load_commissions.useMutation()

    return (
        <div className="flex flex-col gap-5">
            <Button
                disabled={artist_mutation.isPending}
                onMouseDown={() => {
                    artist_mutation.mutate()
                }}
            >
                Load Artists
            </Button>
            <Button
                disabled={commmission_mutation.isPending}
                onMouseDown={() => {
                    commmission_mutation.mutate()
                }}
            >
                Load Commissions
            </Button>
        </div>
    )
}
