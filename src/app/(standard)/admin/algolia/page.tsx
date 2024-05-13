import UpdateAlgoliaButtons from '~/components/update-algolia'

export default function UpdateAlgoliaPage() {
    return (
        <div className="card bg-base-300 shadow-xl">
            <div className="card-body">
                <h2 className="card-title">Update Algolia</h2>
                <div className="divider"></div>
                <div className="flex flex-col gap-5">
                    <UpdateAlgoliaButtons />
                </div>
            </div>
        </div>
    )
}
