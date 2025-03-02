import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { toast } from 'sonner'

import { api } from '~/trpc/server'
import ApplyConForm from './form'
import NemuImage from '~/components/nemu-image'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'

export default async function ConPage(props: { params: Promise<{ slug: string }> }) {
    const { slug } = await props.params
    const current_user = await currentUser()
    const valid_slug = await api.con.validSlug({ slug })

    if (!current_user) {
        return redirect('/')
    }

    if (!valid_slug) {
        toast.error('This con link is invalid or does not exist')
        return redirect('/')
    }

    if (valid_slug.is_expired) {
        toast.error('This con link has expired')
        return redirect('/')
    }

    return (
        <div className="container mx-auto flex max-w-4xl flex-1">
            <Card className="w-full">
                <CardHeader className="flex flex-col items-center justify-center">
                    <NemuImage
                        src="/nemu/sparkles.png"
                        alt="Nemu Sparkles"
                        width={100}
                        height={100}
                    />
                    <CardTitle>Welcome to Nemu!</CardTitle>
                    <CardDescription>
                        Thank you so much for coming to {valid_slug.name}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ApplyConForm slug={slug} />
                </CardContent>
            </Card>
        </div>
    )
}
