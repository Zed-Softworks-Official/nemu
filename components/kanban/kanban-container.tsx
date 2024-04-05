'use client'

import {
    CommissionRequestData,
    KanbanContainerData,
    KanbanTask
} from '@/core/structures'
import { UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PlusCircleIcon, TrashIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'
import KanbanItemComponent from './kanban-item'

export default function KanbanContainerComponent({
    container_data,
    tasks,
    DeleteContainer,
    UpdateContainer,
    CreateTask,
    DeleteTask,
    UpdateTask,
    disable_container_editing,
    disable_item_editing,
    submissions
}: {
    container_data: KanbanContainerData
    tasks: KanbanTask[]
    DeleteContainer: (id: UniqueIdentifier) => void
    UpdateContainer: (id: UniqueIdentifier, title: string) => void
    CreateTask: (id: UniqueIdentifier) => void
    DeleteTask: (id: UniqueIdentifier) => void
    UpdateTask: (id: UniqueIdentifier, content: string) => void
    disable_container_editing?: boolean
    disable_item_editing?: boolean
    submissions?: CommissionRequestData[]
}) {
    const [editMode, setEditMode] = useState(false)
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
        useSortable({
            id: container_data.id,
            data: {
                type: 'Container',
                container_data
            },
            disabled: editMode
        })

    const taskIds = useMemo(() => {
        return tasks.map((task) => task.id)
    }, [tasks])

    const style = {
        transition,
        transform: CSS.Translate.toString(transform)
    }

    if (isDragging) {
        return (
            <div
                className="card shadow-xl bg-base-300 opacity-60"
                ref={setNodeRef}
                style={style}
            >
                <div
                    className="bg-base-200 text-md cursor-grab p-5 rounded-t-xl flex flex-row items-center justify-between gap-5"
                    {...listeners}
                    {...attributes}
                >
                    <div className="flex flex-row gap-5 items-center">
                        <div className="bg-base-300 p-5 rounded-xl card-title">
                            {tasks.length}
                        </div>
                        <h2 className="card-title cursor-pointer">
                            {container_data.title}
                        </h2>
                    </div>
                    {!disable_container_editing && (
                        <div className="flex gap-5">
                            <button type="button" className="btn btn-primary">
                                <PlusCircleIcon className="w-6 h-6" />
                            </button>
                            <button type="button" className="btn btn-outline">
                                <TrashIcon className="w-6 h-6" />
                            </button>
                        </div>
                    )}
                </div>
                <div className="card-body">
                    <div className="flex flex-col flex-grow gap-5">
                        {tasks.map((task) => (
                            <KanbanItemComponent
                                disable_item_editing={disable_item_editing}
                                key={task.id}
                                item_data={task}
                                DeleteTask={DeleteTask}
                                UpdateTask={UpdateTask}
                            />
                        ))}
                    </div>
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
                    <div className="bg-base-300 p-5 rounded-xl card-title">
                        {tasks.length}
                    </div>
                    {!editMode ? (
                        <h2
                            className="card-title cursor-pointer"
                            onClick={() => {
                                if (disable_container_editing) return

                                setEditMode(true)
                            }}
                        >
                            {container_data.title}
                        </h2>
                    ) : (
                        <input
                            className="input input-primary"
                            autoFocus
                            defaultValue={container_data.title}
                            onChange={(e) =>
                                UpdateContainer(container_data.id, e.currentTarget.value)
                            }
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

                {!disable_container_editing && (
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
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => DeleteContainer(container_data.id)}
                        >
                            <TrashIcon className="w-6 h-6" />
                        </button>
                    </div>
                )}
            </div>
            <div className="card-body">
                <div className="flex flex-col flex-grow gap-5">
                    <SortableContext items={taskIds}>
                        {tasks.map((task) => (
                            <KanbanItemComponent
                                key={task.id}
                                item_data={task}
                                DeleteTask={DeleteTask}
                                UpdateTask={UpdateTask}
                                disable_item_editing={disable_item_editing}
                                submission_data={
                                    submissions &&
                                    submissions.find(
                                        (submission) => submission.id === task.id
                                    )
                                }
                            />
                        ))}
                    </SortableContext>
                </div>
            </div>
        </div>
    )
}
