import NemuImage from '~/components/nemu-image'
import ArtistApplyForm from './form'
import { Separator } from '~/components/ui/separator'
import { auth } from '@clerk/nextjs/server'
import { RedirectToSignIn } from '@clerk/nextjs'

export default async function ArtistsApplyPage() {
    const auth_data = await auth()

    if (!auth_data.userId) {
        return <RedirectToSignIn redirectUrl={'/u/login'} />
    }

    return (
        <div className="container mx-auto grid max-w-6xl items-center gap-6 px-4 py-6 md:grid-cols-2 lg:gap-12">
            <div className="bg-background-secondary flex flex-col items-center justify-center space-y-8 rounded-l-xl p-6">
                <div>
                    <h2 className="text-foreground mt-6 text-center text-3xl font-bold tracking-tight">
                        Artists Wanted!
                    </h2>
                    <p className="text-muted-foreground mt-2 text-center text-sm">
                        Join Nemu to showcase your art, connect with a global audience,
                        sell your creations effortlessly, and get commissioned for custom
                        work.
                    </p>
                </div>
                <Separator />
                <ArtistApplyForm />
            </div>
            <div className="flex items-center justify-center">
                <NemuImage
                    src={'/nemu/clipboard.png'}
                    alt="Artists Wanted"
                    width={800}
                    height={800}
                    className="w-full object-cover"
                />
            </div>
        </div>
    )
}
