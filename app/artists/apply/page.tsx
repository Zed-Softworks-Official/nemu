import DefaultPageLayout from '@/app/(default)/layout'
import ArtistApplyForm from '@/components/artist-verification/artist-apply-form'

export default function ArtistsApplyPage() {
    return (
        <DefaultPageLayout>
            <div className="card bg-base-300 w-full shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">Artists Wanted!</h2>
                    <div className="divider"></div>
                    <div className="flex flex-col w-full justify-center items-center">
                        <div className="max-w-xl w-full">
                            <ArtistApplyForm />
                        </div>
                    </div>
                </div>
            </div>
        </DefaultPageLayout>
    )
}
