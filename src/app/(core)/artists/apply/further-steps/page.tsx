import NemuImage from '~/app/_components/nemu-image'

export default function ArtistApplySuccessPage() {
    return (
        <div className="container mx-auto flex max-w-2xl flex-col items-center gap-8 px-4 py-12">
            <div className="flex flex-col items-center justify-center space-y-6">
                <NemuImage
                    src={'/nemu/sparkles.png'}
                    alt="Nemu Excited"
                    width={400}
                    height={400}
                    className="w-64 object-cover"
                />
                <div>
                    <h2 className="text-foreground text-center text-3xl font-bold tracking-tight">
                        Thank you for your Interest!
                    </h2>
                    <p className="text-muted-foreground mt-2 text-center text-sm">
                        We&apos;re glad you&apos;re interested in Nemu! We&apos;ll be in
                        touch soon, until then hold tight!
                    </p>
                </div>
            </div>
        </div>
    )
}
