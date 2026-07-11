import { Waitlist } from '@clerk/nextjs'

export default function HomePage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
            <h1 className="font-semibold text-3xl tracking-tight">Nemu</h1>
            <p className="text-muted-foreground text-sm">
                Control Everything. Share Nothing.
            </p>
            <Waitlist />
        </main>
    )
}
