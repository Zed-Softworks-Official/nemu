
import { redirect } from 'next/navigation'
import CreateUsername from '~/components/auth/create-username'
import { getServerAuthSession } from '~/server/auth'

export default async function NewUser() {
    const session = await getServerAuthSession()

    if (session?.user.name) {
        return redirect('/')
    }

    return <CreateUsername />
}