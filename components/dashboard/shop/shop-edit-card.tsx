'use client'

import Image from 'next/image'
import { TrashIcon } from '@heroicons/react/20/solid'
import { useParams } from 'next/navigation'
import { toast } from 'react-toastify'

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

    // Handles the deletion of items
    async function deleteItem() {
        await toast.promise(
            fetch(`/api/stripe/${param.id}/product/delete/${index}`, {
                method: 'post'
            }),
            {
                pending: 'Deleting Image',
                success: 'Deleted Image',
                error: 'Failed to Delete Image'
            },
            {
                theme: 'dark'
            }
        )
    }

    return (
        <div className="rounded-3xl overflow-hidden">
            <div className="relative top-5">
                <button
                    onClick={deleteItem}
                    type="button"
                    className="bg-error rounded-full p-2 m-2"
                >
                    <TrashIcon className="w-6 h-6 inline-block" />
                    <p className="hidden">Delete</p>
                </button>
            </div>
            <Image src={image_src} alt={alt_text} width={200} height={200} />
        </div>
    )
}
