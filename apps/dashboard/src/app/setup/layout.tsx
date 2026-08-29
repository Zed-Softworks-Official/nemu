import { auth } from '@clerk/nextjs/server'
import { SignedOutRedirect } from '~/components/signed-out-redirect'

export default async function SetupLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    await auth.protect()

    return (
        <SignedOutRedirect>
            <main className="flex min-h-svh items-center justify-center bg-background p-6">
                <div className="w-full max-w-lg">{children}</div>
            </main>
        </SignedOutRedirect>
    )
}
