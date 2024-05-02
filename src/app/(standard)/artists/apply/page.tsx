import ArtistApplyForm from '~/components/artist-verification/artist-apply-form'

export default async function ArtistsApplyPage() {
    return (
        <div className="card w-full bg-base-300 shadow-xl">
            <div className="card-body">
                <h2 className="card-title">Artists Wanted!</h2>
                <div className="divider"></div>
                <div className="flex w-full flex-col items-center justify-center">
                    <div className="w-full max-w-xl">
                        <ArtistApplyForm />
                    </div>
                </div>
            </div>
        </div>
    )
}
