import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { Suspense } from 'react'

import Loading from '~/components/ui/loading'
import { DataTable } from '~/components/data-table'
import GenerateAristCode from './generate'
import { Separator } from '~/components/ui/separator'

type ArtistCode = {
    code: string
    created_at: string
}

const get_artist_codes = unstable_cache(
    async () => {
        const artist_codes = await db.query.artist_codes.findMany()

        if (!artist_codes) {
            return []
        }

        const result: ArtistCode[] = []
        for (const code of artist_codes) {
            result.push({
                code: code.code,
                created_at: code.created_at.toLocaleDateString()
            })
        }

        return result
    },
    ['artist_codes'],
    {
        tags: ['artist_codes'],
        revalidate: 3600
    }
)

export default function GenerateCodePage() {
    return (
        <div className="container mx-auto flex flex-col gap-5">
            <GenerateAristCode />
            <Suspense fallback={<Loading />}>
                <CurrentArtistCodes />
            </Suspense>
        </div>
    )
}

async function CurrentArtistCodes() {
    const artist_codes = await get_artist_codes()

    return (
        <div>
            <div className="divider"></div>
            <h1 className="text-3xl font-bold">Current Artist Codes</h1>
            <Separator />
            <div className="flex flex-col gap-5">
                <DataTable
                    columns={[
                        {
                            accessorKey: 'code',
                            header: 'Code'
                        },
                        {
                            accessorKey: 'created_at',
                            header: 'Created At'
                        }
                    ]}
                    data={artist_codes}
                />
            </div>
        </div>
    )
}
