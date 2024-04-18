import { redirect } from 'next/navigation'
import GenerateAristCode from '~/components/artist-verification/generate-artist-code'
import { UserRole } from '~/core/structures'
import { getServerAuthSession } from '~/server/auth'

export default async function GenerateCodePage() {
    const session = await getServerAuthSession()

    if (!session) {
        return redirect('/')
    }

    if (session.user.role != UserRole.Admin) {
        return redirect('/')
    }

    return <GenerateAristCode />
}
