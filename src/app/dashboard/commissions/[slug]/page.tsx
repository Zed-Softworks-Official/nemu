import { RedirectToSignIn } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { Button } from '~/components/ui/button'

import { api } from '~/trpc/server'
import { PublishButton, RequestList } from './details'
import { notFound } from 'next/navigation'
import { Separator } from '~/components/ui/separator'

export default async function CommissionDetailPage(props: {
    params: Promise<{ slug: string }>
}) {
    const user = await currentUser()
    const params = await props.params

    if (!user) {
        return <RedirectToSignIn />
    }

    const commission = await api.commission.get_commission({
        handle: user?.publicMetadata.handle as string,
        slug: params.slug
    })

    if (!commission?.id) {
        return notFound()
    }

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="flex flex-row items-center justify-between pb-5">
                <h1 className="text-2xl font-bold">{commission.title}</h1>
                <div className="flex gap-2">
                    <Button asChild variant={'outline'}>
                        <Link href={`/dashboard/commissions/${params.slug}/update`}>
                            <Pencil className="h-6 w-6" />
                            Edit Commission
                        </Link>
                    </Button>
                    <PublishButton id={commission.id} published={commission.published} />
                </div>
            </div>
            <Separator />

            <RequestList requests={commission.requests ?? []} slug={params.slug} />
        </div>
    )
}
