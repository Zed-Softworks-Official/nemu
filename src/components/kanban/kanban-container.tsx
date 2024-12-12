'use client'

import type { KanbanContainerData, KanbanTask } from '~/lib/structures'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'
import KanbanItemComponent from '~/components/kanban/kanban-task'
import { PlusCircleIcon, Trash2Icon } from 'lucide-react'
import { Button } from '~/components/ui/button'

export default function KanbanContainerComponent({
    container_data,
    tasks,
    DeleteContainer,
    UpdateContainer,
    CreateTask,
    DeleteTask,
    UpdateTask
}: {
    container_data: KanbanContainerData
    tasks: KanbanTask[]
    DeleteContainer: (id: UniqueIdentifier) => void
    UpdateContainer: (id: UniqueIdentifier, title: string) => void
    CreateTask: (id: UniqueIdentifier) => void
    DeleteTask: (id: UniqueIdentifier) => void
    UpdateTask: (id: UniqueIdentifier, content: string) => void
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
                className="card bg-base-300 opacity-60 shadow-xl"
                ref={setNodeRef}
                style={style}
            >
                <div
                    className="text-md bg-base-200 flex cursor-grab flex-row items-center justify-between gap-5 rounded-t-xl p-5"
                    {...listeners}
                    {...attributes}
                >
                    <div className="flex flex-row items-center gap-5">
                        <div className="card-title bg-base-300 rounded-xl p-5">
                            {tasks.length}
                        </div>
                        <h2 className="card-title cursor-pointer">
                            {container_data.title}
                        </h2>
                    </div>
                    <div className="flex gap-5">
                        <button type="button" className="btn btn-primary">
                            <PlusCircleIcon className="h-6 w-6" />
                        </button>
                        <button type="button" className="btn btn-outline">
                            <Trash2Icon className="h-6 w-6" />
                        </button>
                    </div>
                </div>
                <div className="card-body">
                    <div className="flex flex-grow flex-col gap-5">
                        {tasks.map((task) => (
                            <KanbanItemComponent
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
        <div
            className="rounded-xl bg-background-secondary shadow-xl"
            ref={setNodeRef}
            style={style}
        >
            <div
                className="text-md bg-base-200 flex cursor-grab flex-row items-center justify-between gap-5 rounded-t-xl p-5"
                {...listeners}
                {...attributes}
            >
                <div className="flex flex-row items-center gap-5">
                    <div className="card-title bg-base-300 rounded-xl p-5">
                        {tasks.length}
                    </div>
                    {!editMode ? (
                        <h2
                            className="card-title cursor-pointer"
                            onMouseDown={() => {
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

                <div className="flex gap-5">
                    <Button onMouseDown={() => CreateTask(container_data.id)}>
                        <PlusCircleIcon className="h-6 w-6" />
                    </Button>
                    <Button
                        variant={'outline'}
                        onMouseDown={() => DeleteContainer(container_data.id)}
                    >
                        <Trash2Icon className="h-6 w-6" />
                    </Button>
                </div>
            </div>
            <div className="card-body grid auto-rows-min gap-4">
                <SortableContext items={taskIds}>
                    {tasks.map((task) => (
                        <KanbanItemComponent
                            key={task.id}
                            item_data={task}
                            DeleteTask={DeleteTask}
                            UpdateTask={UpdateTask}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}
