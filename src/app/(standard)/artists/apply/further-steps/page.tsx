import NemuImage from '~/components/nemu-image'

export default function ArtistApplySuccessPage() {
    return (
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-6 md:grid-cols-2 lg:gap-12">
            <div className="flex flex-col items-center justify-center space-y-8 rounded-l-xl bg-background-secondary p-6">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
                        Thank you for your Interest!
                    </h2>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                        We&apos;re glad you&apos;re interested in Nemu! We&apos;ll be in
                        touch soon, until then hold tight!
                    </p>
                </div>
            </div>
            <div className="flex items-center justify-center">
                <NemuImage
                    src={'/nemu/sparkles.png'}
                    alt="Nemu Excited"
                    width={800}
                    height={800}
                    className="w-full object-cover"
                />
            </div>
        </div>
    )
}
