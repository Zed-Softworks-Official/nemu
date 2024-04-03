import DefaultPageLayout from '@/app/(default)/layout'
import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import GenerateAristCode from '@/components/artist-verification/generate-code'
import { Role } from '@/core/structures'
import { redirect } from 'next/navigation'

export default async function GenerateCodePage() {
    const session = await getServerAuthSession()

    if (!session) {
        return redirect('/')
    }

    if (session.user.role != Role.Admin) {
        return redirect('/')
    }

    return (
        <DefaultPageLayout>
            <GenerateAristCode />
        </DefaultPageLayout>
    )
}
