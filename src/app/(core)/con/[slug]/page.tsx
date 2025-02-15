import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { toast } from 'sonner'

import { api } from '~/trpc/server'
import ApplyConForm from './form'
import NemuImage from '~/components/nemu-image'

export default async function ConPage(props: { params: Promise<{ slug: string }> }) {
    const { slug } = await props.params
    const current_user = await currentUser()
    const valid_slug = await api.con.valid_slug({ slug })

    if (!current_user) {
        return redirect('/')
    }

    if (!valid_slug) {
        toast.error('Invalid con slug')
        return redirect('/')
    }

    if (valid_slug.is_expired) {
        toast.error('Con Expired')
        return redirect('/')
    }

    return (
        <div className="container mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center gap-4">
            <NemuImage
                src="/nemu/sparkles.png"
                alt="Nemu Sparkles"
                width={100}
                height={100}
            />
            <h1 className="text-2xl font-bold">Welcome to Nemu!</h1>
            <p className="text-center text-sm text-muted-foreground">
                Thank you so much for coming to {valid_slug.name}
            </p>

            <ApplyConForm />
        </div>
    )
}
