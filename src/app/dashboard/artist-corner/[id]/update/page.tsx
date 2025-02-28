import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'
import { UpdateForm } from '../../form'

export default async function ArtistCornerUpdatePage(props: {
    params: Promise<{ id: string }>
}) {
    const { id } = await props.params
    const data = await api.artist_corner.get_product_by_id_dashboard({
        id
    })

    if (!data.product) {
        return notFound()
    }

    return (
        <div className="container mx-auto max-w-4xl">
            <div className="flex items-center justify-between gap-2">
                <h1 className="text-2xl font-bold">{data.product.name}</h1>
            </div>

            <UpdateForm product={data.product} />
        </div>
    )
}
