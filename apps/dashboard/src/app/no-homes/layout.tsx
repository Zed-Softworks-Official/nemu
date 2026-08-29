import { auth } from '@clerk/nextjs/server'
import { SignedOutRedirect } from '~/components/signed-out-redirect'

export default async function NoHomesLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    await auth.protect()

    return <SignedOutRedirect>{children}</SignedOutRedirect>
}
