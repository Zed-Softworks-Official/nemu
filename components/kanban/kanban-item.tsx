'use client'

import { CSS } from '@dnd-kit/utilities'

import { ClassNames } from '@/core/helpers'
import { useSortable } from '@dnd-kit/sortable'
import { UniqueIdentifier } from '@dnd-kit/core'

import { Bars3Icon } from '@heroicons/react/20/solid'

type ItemsType = {
    id: UniqueIdentifier
    title: string
}

export default function KanbanItem({ id, title }: ItemsType) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({
            id: id,
            data: {
                type: 'item'
            }
        })
    return (
        <div
            className={ClassNames('card w-full bg-base-100', isDragging && 'opacity-50')}
            ref={setNodeRef}
            {...attributes}
            style={{ transition, transform: CSS.Translate.toString(transform) }}
        >
            <div className="card-body">
                <div className="flex justify-between items-center">
                    <h2 className="card-title">{title}</h2>
                    <button className="btn btn-ghost" {...listeners}>
                        <Bars3Icon className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    )
}
