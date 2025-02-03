import { DataTable } from '~/components/data-table'
import GenerateAristCode from './generate'
import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/server'

export default function GenerateCodePage() {
    return (
        <div className="container mx-auto flex flex-col">
            <GenerateAristCode />
            <CurrentArtistCodes />
        </div>
    )
}

async function CurrentArtistCodes() {
    const artist_codes = await api.artist_verification.get_artist_codes()

    return (
        <div className="flex flex-1 flex-col gap-2 pt-10">
            <h1 className="text-xl font-bold">Current Artist Codes</h1>
            <Separator />
            <div className="flex flex-col gap-5">
                <DataTable
                    columnDefs={[
                        {
                            field: 'code',
                            headerName: 'Code',
                            flex: 1
                        },
                        {
                            field: 'created_at',
                            headerName: 'Created At',
                            flex: 1,
                            filter: true
                        }
                    ]}
                    rowData={artist_codes}
                />
            </div>
        </div>
    )
}
