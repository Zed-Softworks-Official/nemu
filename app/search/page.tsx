import DefaultPageLayout from '../(default)/layout'

export default function SearchPage({
    searchParams
}: {
    searchParams: { [key: string]: string | string[] | number | number[] | undefined }
}) {
    return (
        <DefaultPageLayout>
            <pre>{JSON.stringify(searchParams, null, 2)}</pre>
        </DefaultPageLayout>
    )
}
