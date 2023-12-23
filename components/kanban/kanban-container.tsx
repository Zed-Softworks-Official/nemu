'use client'

import { CSS } from '@dnd-kit/utilities'

import classNames from '@/helpers/classnames'
import { useSortable } from '@dnd-kit/sortable'
import { UniqueIdentifier } from '@dnd-kit/core'

import { Bars3Icon } from '@heroicons/react/20/solid'

export default function KanbanContainer({
    id,
    children,
    title,
    description,
    onAddItem
}: {
    id: UniqueIdentifier
    children: React.ReactNode
    title: string
    description?: string
    onAddItem?: () => void
}) {
    const { attributes, setNodeRef, listeners, transform, transition, isDragging } =
        useSortable({
            id: id,
            data: {
                type: 'container'
            }
        })

    return (
        <div
            className={classNames(
                'flex flex-col justify-center items-center bg-base-300 rounded-xl p-5 space-y-6',
                isDragging && 'opacity-50'
            )}
            {...attributes}
            ref={setNodeRef}
            style={{ transition, transform: CSS.Translate.toString(transform) }}
        >
            <div className="relative w-full p-5">
                <button
                    className="btn btn-ghost absolute top-[7%] right-[7%]"
                    {...listeners}
                >
                    <Bars3Icon className="w-6 h-6" />
                </button>
                <h1 className="font-bold text-3xl">{title}</h1>
                <p className="text-lg">{description}</p>
            </div>
            {children}
            <button className="btn btn-ghost" onClick={onAddItem}>
                Add Item
            </button>
        </div>
    )
}
