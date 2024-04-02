import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import CreateUsername from '@/components/auth/create-username'
import { redirect } from 'next/navigation'

export default async function NewUser() {
    const session = await getServerAuthSession()

    if (session?.user.name) {
        return redirect('/')
    }

    return <CreateUsername />
}
