import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/server'

export default async function ArtistCornerProductPags(props: {
    params: Promise<{ id: string }>
}) {
    const { id } = await props.params
    const data = await api.artist_corner.get_product_by_id({ id })

    if (!data.product || !data.sales) {
        return notFound()
    }

    return (
        <div className="container mx-auto">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between gap-2">
                    <h1 className="text-2xl font-bold">{data.product.name}</h1>
                    <Button asChild>
                        <Link href={`/dashboard/artist-corner/${id}/edit`}>
                            <span className="sr-only">Edit</span>
                            <Pencil className="size-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            <>Some other stuff</>
        </div>
    )
}
