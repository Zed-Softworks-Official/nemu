import { FormBuilderElement } from './builder'

export default async function FormBuilderPage(props: {
    params: Promise<{ id: string }>
}) {
    const params = await props.params

    return (
        <div className="mx-auto max-w-6xl">
            <FormBuilderElement id={params.id} />
        </div>
    )
}
