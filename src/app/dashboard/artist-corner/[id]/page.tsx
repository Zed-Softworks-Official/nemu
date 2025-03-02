import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Button } from '~/components/ui/button'
import { api } from '~/trpc/server'
import PublishProduct from './publish'

export default async function ArtistCornerProductPage(props: {
    params: Promise<{ id: string }>
}) {
    const { id } = await props.params
    const data = await api.artistCorner.getProductByIdDashboard({ id })

    if (!data.product || !data.sales) {
        return notFound()
    }

    return (
        <div className="container mx-auto">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between gap-2">
                    <h1 className="text-2xl font-bold">{data.product.name}</h1>
                    <div className="flex items-center gap-2">
                        <PublishProduct id={id} published={data.product.published} />
                        <Button asChild size="icon">
                            <Link href={`/dashboard/artist-corner/${id}/update`}>
                                <span className="sr-only">Edit</span>
                                <Pencil className="size-4" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex h-full w-full flex-col items-center justify-center gap-5">
                <h2 className="text-muted-foreground text-2xl font-bold">
                    Stats Coming Soon
                </h2>
            </div>
        </div>
    )
}
