import { redirect } from 'next/navigation'
import ArtistApplyForm from '~/components/artist-verification/artist-apply-form'
import { getServerAuthSession } from '~/server/auth'

export default async function ArtistsApplyPage() {
    const session = await getServerAuthSession()

    if (!session) {
        return redirect('/u/login')
    }

    return (
        <div className="card bg-base-300 w-full shadow-xl">
            <div className="card-body">
                <h2 className="card-title">Artists Wanted!</h2>
                <div className="divider"></div>
                <div className="flex flex-col w-full justify-center items-center">
                    <div className="max-w-xl w-full">
                        <ArtistApplyForm session={session} />
                    </div>
                </div>
            </div>
        </div>
    )
}
