'use client'

import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'

export default function UpdateAlgoliaButtons() {
    const artist_mutation = api.algolia.set_artist.useMutation()

    return (
        <div className="flex flex-col gap-5">
            <Button
                onClick={() => {
                    artist_mutation.mutate()
                }}
            >
                Add Artists
            </Button>
        </div>
    )
}
