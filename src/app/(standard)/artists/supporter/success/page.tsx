import NemuImage from '~/components/nemu-image'

export default function SupporterSuccessPage() {
    return (
        <div className="flex flex-col justify-center pt-24">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-5 sm:text-center">
                    <NemuImage
                        src={'/nemu/sparkles.png'}
                        alt="Nemu Excited"
                        width={200}
                        height={200}
                        priority
                    />
                    <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        Thank you for your support!
                    </h2>
                    <p className="mt-6 text-lg leading-8 text-muted-foreground">
                        We&apos;re so glad you&apos;re supporting us! We&apos;ll be in
                        touch soon with updates on how you can help fund the development
                        of Nemu.
                    </p>
                </div>
            </div>
        </div>
    )
}
