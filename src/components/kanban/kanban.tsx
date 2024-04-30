'use client'

import React, { useMemo, useState } from 'react'
import KanbanContainerComponent from '~/components/kanban/kanban-container'
import { KanbanContainerData, KanbanTask } from '~/core/structures'
import {
    DndContext,
    DragEndEvent,
    DragOverEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    UniqueIdentifier,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import { SortableContext, arrayMove } from '@dnd-kit/sortable'
import KanbanItemComponent from '~/components/kanban/kanban-task'

import { PlusCircleIcon, SaveIcon } from 'lucide-react'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'

export default function Kanban({
    title,
    client,
    header,
    kanban_id,
    kanban_containers,
    kanban_tasks
}: {
    title?: string
    client?: string
    header?: React.ReactNode
    kanban_id?: string
    kanban_containers: KanbanContainerData[]
    kanban_tasks: KanbanTask[]
}) {
    const [containers, setContainers] = useState<KanbanContainerData[]>(kanban_containers)
    const [tasks, setTasks] = useState<KanbanTask[]>(kanban_tasks)

    const [activeContainer, setActiveContainer] = useState<KanbanContainerData | null>(
        null
    )
    const [activeTask, setActiveTask] = useState<KanbanTask | null>(null)

    const [saving, setSaving] = useState(false)
    const [autosave, setAutosave] = useState(true)

    const containerIds = useMemo(
        () => containers.map((container) => container.id),
        [containers]
    )

    const mutation = api.kanban.set_kanban.useMutation({
        onMutate: () => {},
        onSuccess: () => {},
        onError: (e) => {}
    })

    const sesnors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3
            }
        })
    )

    async function SaveKanban(data: {
        containers: KanbanContainerData[]
        tasks: KanbanTask[]
    }) {
        if (saving || !autosave) return

        setSaving(true)

        if (kanban_id) {
            mutation.mutate({
                kanban_id,
                containers: JSON.stringify(containers),
                tasks: JSON.stringify(tasks)
            })
        }
    }

    function CreateNewContainer() {
        const containerToAdd: KanbanContainerData = {
            id: crypto.randomUUID(),
            title: `Container ${containers.length + 1}`
        }

        setContainers([...containers, containerToAdd])
    }

    function DeleteContainer(container_id: UniqueIdentifier) {
        const filteredContainers = containers.filter(
            (container) => container.id !== container_id
        )
        setContainers(filteredContainers)

        const newTasks = tasks.filter((task) => task.container_id !== container_id)
        setTasks(newTasks)
    }

    function UpdateContainer(container_id: UniqueIdentifier, title: string) {
        const newContainers = containers.map((container) => {
            if (container.id !== container_id) return container

            return { ...container, title }
        })

        setContainers(newContainers)
    }

    function CreateTask(container_id: UniqueIdentifier) {
        const newTask: KanbanTask = {
            id: crypto.randomUUID(),
            container_id: container_id,
            content: 'New Item'
        }

        setTasks([...tasks, newTask])
    }

    function DeleteTask(id: UniqueIdentifier) {
        const newTasks = tasks.filter((task) => task.id !== id)
        setTasks(newTasks)
    }

    function UpdateTask(id: UniqueIdentifier, content: string) {
        const newTasks = tasks.map((task) => {
            if (task.id !== id) return task
            return { ...task, content }
        })

        setTasks(newTasks)
    }

    function OnDragStart(event: DragStartEvent) {
        if (event.active.data.current?.type === 'Container') {
            setActiveContainer(event.active.data.current.container_data)
            return
        }

        if (event.active.data.current?.type === 'Task') {
            setActiveTask(event.active.data.current.item_data)
            return
        }
    }

    function OnDragEnd(event: DragEndEvent) {
        setActiveContainer(null)
        setActiveTask(null)

        const { active, over } = event

        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        setContainers((containers) => {
            const activeContainerIndex = containers.findIndex(
                (container) => container.id === activeId
            )
            const overContainerIndex = containers.findIndex(
                (container) => container.id === overId
            )

            return arrayMove(containers, activeContainerIndex, overContainerIndex)
        })
    }

    function OnDragOver(event: DragOverEvent) {
        const { active, over } = event
        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        // Dropping task over another task
        const isActiveATask = active.data.current?.type === 'Task'
        const isOverATask = over.data.current?.type === 'Task'

        if (!isActiveATask) return

        if (isActiveATask && isOverATask) {
            setTasks((tasks) => {
                const activeIndex = tasks.findIndex((t) => t.id === activeId)
                const overIndex = tasks.findIndex((t) => t.id === overId)

                if (tasks[activeIndex]?.container_id !== tasks[overIndex]?.container_id) {
                    tasks[activeIndex]!.container_id = tasks[overIndex]!.container_id
                }

                return arrayMove(tasks, activeIndex, overIndex)
            })
        }

        const isOverAContainer = over.data.current?.type === 'Container'

        // Dropping task over container
        if (isActiveATask && isOverAContainer) {
            setTasks((tasks) => {
                const activeIndex = tasks.findIndex((t) => t.id === activeId)

                tasks[activeIndex]!.container_id = overId

                return arrayMove(tasks, activeIndex, activeIndex)
            })
        }
    }

    return (
        <DndContext
            sensors={sesnors}
            onDragStart={OnDragStart}
            onDragEnd={OnDragEnd}
            onDragOver={OnDragOver}
        >
            <div className="card bg-base-100">
                <div className="card-body gap-5">
                    <div className="flex justify-between items-center">
                        {header ? (
                            <>{header}</>
                        ) : (
                            <div>
                                <h2 className="text-xl font-bold">Kanban for {client}</h2>
                                <p>Commission Title: {title}</p>
                            </div>
                        )}

                        <div className="flex items-center gap-5">
                            <Button
                                variant={'dark'}
                                disabled={mutation.isPending}
                                onClick={() => SaveKanban({ containers, tasks })}
                            >
                                {mutation.isPending ? (
                                    <>
                                        <span className="loading loading-spinner"></span>
                                        <p>Saving</p>
                                    </>
                                ) : (
                                    <>
                                        <SaveIcon className="w-6 h-6" />
                                        <p>Save</p>
                                    </>
                                )}
                            </Button>
                            <Button onClick={() => CreateNewContainer()}>
                                <PlusCircleIcon className="w-6 h-6" />
                                Add Container
                            </Button>
                        </div>
                    </div>
                    <div className="divider"></div>

                    <SortableContext items={containerIds}>
                        <div className="columns-1 gap-5 lg:gap-8 sm:columns-2 lg:columns-3 [&>div:not(:first-child)]:mt-5 lg:[&>div:not(:first-child)]:mt-8">
                            {containers.map((container) => (
                                <KanbanContainerComponent
                                    key={container.id}
                                    container_data={container}
                                    tasks={tasks.filter(
                                        (task) => task.container_id === container.id
                                    )}
                                    DeleteContainer={DeleteContainer}
                                    UpdateContainer={UpdateContainer}
                                    CreateTask={CreateTask}
                                    DeleteTask={DeleteTask}
                                    UpdateTask={UpdateTask}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </div>
            </div>
            <DragOverlay>
                {activeContainer && (
                    <KanbanContainerComponent
                        container_data={activeContainer}
                        tasks={tasks.filter(
                            (task) => task.container_id === activeContainer.id
                        )}
                        DeleteContainer={DeleteContainer}
                        UpdateContainer={UpdateContainer}
                        CreateTask={CreateTask}
                        DeleteTask={DeleteTask}
                        UpdateTask={UpdateTask}
                    />
                )}
                {activeTask && (
                    <KanbanItemComponent
                        item_data={activeTask}
                        UpdateTask={UpdateTask}
                        DeleteTask={DeleteTask}
                    />
                )}
            </DragOverlay>
        </DndContext>
    )
}