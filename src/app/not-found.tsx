import NemuImage from '~/components/nemu-image'

export default function NotFound() {
    return (
        <div className="container mx-auto flex h-full w-full flex-col items-center justify-center gap-5 p-5 text-center">
            <NemuImage
                src="/nemu/not-like-this.png"
                alt="Not Found"
                width={400}
                height={400}
            />
            <h1 className="text-3xl font-bold">404</h1>
            <p className="text-lg text-muted-foreground">
                Oh Nyo! The page you&apos;re looking for doesn&apos;t exist
            </p>
        </div>
    )
}
