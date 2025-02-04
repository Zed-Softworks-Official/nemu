import { UpdateForm } from '../form'

export default async function PortfolioImagePage(props: {
    params: Promise<{ id: string }>
}) {
    const params = await props.params

    return (
        <div className="container mx-auto max-w-xl">
            <UpdateForm id={params.id} />
        </div>
    )
}
