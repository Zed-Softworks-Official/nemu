import NemuImage from '~/app/_components/nemu-image'

export default async function SuccessPage() {
    return (
        <div className="container mx-auto flex h-full min-h-full flex-1 flex-col items-center justify-center gap-2">
            <NemuImage src="/nemu/sparkles.png" alt="Sparkles" width={200} height={200} />
            <h1 className="text-2xl font-bold">Success!</h1>
            <p>Your purchase has been completed.</p>
        </div>
    )
}
