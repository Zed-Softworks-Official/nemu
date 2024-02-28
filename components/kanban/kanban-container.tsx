'use client'

import { KanbanData } from '@/core/structures'
import { UniqueIdentifier } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PlusCircleIcon, TrashIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import KanbanItemComponent from './kanban-item'

export default function KanbanContainerComponent({
    container_data,
    DeleteContainer,
    UpdateContainer,
    CreateTask
}: {
    container_data: KanbanData
    DeleteContainer: (id: UniqueIdentifier) => void
    UpdateContainer: (id: UniqueIdentifier, title: string) => void
    CreateTask: (id: UniqueIdentifier) => void
}) {
    const [editMode, setEditMode] = useState(false)
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
        id: container_data.id,
        data: {
            type: 'Container',
            container_data
        },
        disabled: editMode
    })

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    if (isDragging) {
        return (
            <div className="card shadow-xl bg-base-300 opacity-60 border-2 border-primary" ref={setNodeRef} style={style}>
                <div
                    className="bg-base-200 text-md cursor-grab p-5 rounded-t-xl flex flex-row items-center justify-between gap-5"
                    {...listeners}
                    {...attributes}
                >
                    <div className="flex flex-row gap-5">
                        <div className="bg-base-300 p-5 rounded-xl card-title">{container_data.items.length}</div>
                        <h2 className="card-title">{container_data.title}</h2>
                    </div>
                    <button type="button" className="btn btn-outline" onClick={() => DeleteContainer(container_data.id)}>
                        <TrashIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="card-body">
                    <div className="flex flex-grow min-h-96">Kanban Items</div>
                    <div>Footer</div>
                </div>
            </div>
        )
    }

    return (
        <div className="card shadow-xl bg-base-300" ref={setNodeRef} style={style}>
            <div
                className="bg-base-200 text-md cursor-grab p-5 rounded-t-xl flex flex-row items-center justify-between gap-5"
                {...listeners}
                {...attributes}
            >
                <div className="flex flex-row gap-5 items-center">
                    <div className="bg-base-300 p-5 rounded-xl card-title">{container_data.items.length}</div>
                    {!editMode ? (
                        <h2 className="card-title cursor-pointer" onClick={() => setEditMode(true)}>
                            {container_data.title}
                        </h2>
                    ) : (
                        <input
                            className="input input-primary"
                            autoFocus
                            defaultValue={container_data.title}
                            onChange={(e) => UpdateContainer(container_data.id, e.currentTarget.value)}
                            onBlur={() => {
                                setEditMode(false)
                            }}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return

                                setEditMode(false)
                            }}
                        />
                    )}
                </div>
                <div className="flex gap-5">
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            CreateTask(container_data.id)
                        }}
                    >
                        <PlusCircleIcon className="w-6 h-6" />
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => DeleteContainer(container_data.id)}>
                        <TrashIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>
            <div className="card-body">
                <div className="flex flex-col flex-grow gap-5">
                    {container_data.items.map((item) => (
                        <KanbanItemComponent item_data={item} />
                    ))}
                </div>
            </div>
        </div>
    )
}
