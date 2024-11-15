import NemuImage from '~/components/nemu-image'
import ArtistApplyForm from './form'
import { Separator } from '~/components/ui/separator'

export default function ArtistsApplyPage() {
    return (
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-6 md:grid-cols-2 lg:gap-12">
            <div className="flex flex-col items-center justify-center space-y-8 rounded-l-xl bg-background-secondary p-6">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
                        Artists Wanted!
                    </h2>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
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
