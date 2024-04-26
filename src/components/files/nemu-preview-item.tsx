'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2Icon } from 'lucide-react'

import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'

export default function NemuPreviewItem({ preview, i }: { preview: string; i: number }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: `nemu-upload-preview-${i}`
    })

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    return (
        <div
            className="w-32 cursor-grab hover:scale-110 transition-all duration-200 ease-in-out relative"
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
        >
            <NemuImage
                src={preview}
                alt="Image Preview"
                className="w-full h-fit rounded-xl"
                width={200}
                height={200}
            />
            <div className="absolute bg-black/80 w-full h-full hidden hover:block">
                <div className="flex flex-col justify-center items-center w-full h-full">
                    <Button
                        variant={'destructive'}
                        onClick={() => {
                            console.log('Delete image')
                        }}
                    >
                        <Trash2Icon className="w-6 h-6" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
