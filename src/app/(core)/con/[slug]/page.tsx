import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { toast } from 'sonner'

import { api } from '~/trpc/server'
import ApplyConForm from './form'
import NemuImage from '~/app/_components/nemu-image'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/app/_components/ui/card'

export default async function ConPage(props: { params: Promise<{ slug: string }> }) {
    const { slug } = await props.params
    const user = await currentUser()
    const validSlug = await api.con.validSlug({ slug })

    if (!user) {
        return redirect('/')
    }

    if (!validSlug) {
        toast.error('This con link is invalid or does not exist')
        return redirect('/')
    }

    if (validSlug.isExpired) {
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
                        Thank you so much for coming to {validSlug.name}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ApplyConForm slug={slug} />
                </CardContent>
            </Card>
        </div>
    )
}
