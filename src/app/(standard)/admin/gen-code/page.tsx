import { DataTable } from '~/components/data-table'
import GenerateAristCode from './generate'
import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/server'

export default function GenerateCodePage() {
    return (
        <div className="container mx-auto flex flex-col gap-5">
            <GenerateAristCode />
            <CurrentArtistCodes />
        </div>
    )
}

async function CurrentArtistCodes() {
    const artist_codes = await api.artist_verification.get_artist_codes()

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
