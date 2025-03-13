import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { api } from '~/trpc/server'
import { UpdateForm } from '../../form'
import { Button } from '~/app/_components/ui/button'
import { Suspense } from 'react'
import Loading from '~/app/_components/ui/loading'

export default async function ArtistCornerUpdatePage(props: {
    params: Promise<{ id: string }>
}) {
    const { id } = await props.params
    const data = await api.artistCorner.getProductByIdDashboard({
        id
    })

    if (!data.product) {
        return notFound()
    }

    return (
        <div className="container mx-auto max-w-4xl">
            <div className="flex items-center justify-between gap-2">
                <h1 className="text-2xl font-bold">{data.product.title}</h1>
                <Button asChild>
                    <Link href={`/dashboard/artist-corner/${id}`}>
                        <ArrowLeft className="size-4" />
                        Back To Product
                    </Link>
                </Button>
            </div>

            <Suspense fallback={<Loading />}>
                <UpdateForm product={data.product} />
            </Suspense>
        </div>
    )
}
