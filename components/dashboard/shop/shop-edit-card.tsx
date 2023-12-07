'use client'

import { TrashIcon } from '@heroicons/react/20/solid'
import { useParams, useRouter } from 'next/navigation'
import { CreateToastPromise } from '@/helpers/toast-promise'
import NemuImage from '@/components/nemu-image'

export default function ShopEditCard({
    image_src,
    alt_text,
    index
}: {
    image_src: string
    alt_text: string
    index: number
}) {
    const param = useParams()
    const { refresh } = useRouter()

    // Handles the deletion of items
    async function deleteItem() {
        CreateToastPromise(
            fetch(`/api/stripe/${param.id}/product/delete/${index}`, {
                method: 'post'
            }),
            {
                pending: 'Deleting Image',
                success: 'Deleted Image'
            }
        ).then(() => {
            return refresh()
        })
    }

    return (
        <div className="rounded-3xl overflow-hidden">
            <div className="relative top-5">
                <button
                    onClick={deleteItem}
                    type="button"
                    className="btn btn-error rounded-full p-2 m-2"
                >
                    <TrashIcon className="w-6 h-6 inline-block" />
                    <p className="hidden">Delete</p>
                </button>
            </div>
            <NemuImage src={image_src} alt={alt_text} width={200} height={200} />
        </div>
    )
}
