import { api } from '@/core/api/server'
import DefaultPageLayout from '../(default)/layout'

export default async function DownloadsPage() {
    const downloads = await api.user.get_downloads()

    return (
        <DefaultPageLayout>
            <pre>{JSON.stringify(downloads, null, 2)}</pre>
        </DefaultPageLayout>
    )
}
