import { revalidateTag } from 'next/cache'

export async function invalidate_cache(tag: string) {
    revalidateTag(tag)
}
