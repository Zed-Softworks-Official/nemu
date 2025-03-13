import NemuImage from '~/app/_components/nemu-image'

export default function SubscriptionError() {
    return (
        <div className="container mx-auto flex h-full w-full flex-col items-center justify-center gap-5 p-5 text-center">
            <NemuImage
                src="/nemu/not-like-this.png"
                alt="Error"
                width={400}
                height={400}
            />
            <h1 className="text-3xl font-bold">PANIC</h1>
            <p className="text-muted-foreground text-lg">
                Oh Nyo! Looks Like Something Went Wrong.
            </p>
        </div>
    )
}
