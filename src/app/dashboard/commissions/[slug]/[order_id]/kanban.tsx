'use client'

import { useMemo, useState } from 'react'
import {
    DndContext,
    type DragEndEvent,
    type DragOverEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    type UniqueIdentifier,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable'
import { Plus, Save, Trash2 } from 'lucide-react'
import { createId } from '@paralleldrive/cuid2'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

import { useDashboardOrder } from '~/components/orders/dashboard-order'

import type {
    KanbanContainerData,
    KanbanTaskData
} from '~/lib/structures/kanban-structures'
import { Input } from '~/components/ui/input'
import { api } from '~/trpc/react'
import { toast } from 'sonner'

export function Kanban() {
    const [activeContainer, setActiveContainer] = useState<KanbanContainerData | null>(
        null
    )
    const [activeTask, setActiveTask] = useState<KanbanTaskData | null>(null)

    const { containers, tasks, set_containers, set_tasks, kanban_id } =
        useDashboardOrder()
    const saveKanban = api.kanban.update_kanban.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Saving Kanban...')

            return { toast_id }
        },
        onError: (_, __, context) => {
            if (!context?.toast_id) return

            toast.error('Failed to save Kanban', {
                id: context.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            if (!context?.toast_id) return

            toast.success('Kanban Saved!', {
                id: context.toast_id
            })
        }
    })

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 10
            }
        })
    )

    const containerIds = useMemo(() => {
        return containers?.map((container) => container.id) ?? []
    }, [containers])

    function addContainer() {
        if (!containers?.length) {
            return
        }

        const containerData: KanbanContainerData = {
            id: createId(),
            title: `Container ${containers?.length + 1}`
        }

        set_containers([...containers, containerData])
    }

    function deleteContainer(containerId: UniqueIdentifier) {
        if (!containers || !tasks) {
            return
        }

        const filteredContainers = containers.filter(
            (container) => container.id !== containerId
        )

        set_containers(filteredContainers)

        const newTasks = tasks.filter((task) => task.container_id !== containerId)
        set_tasks(newTasks)
    }

    function updateContainer(containerId: UniqueIdentifier, title: string) {
        if (!containers) {
            return
        }

        const newContainers = containers.map((container) => {
            if (container.id !== containerId) return container

            return { ...container, title }
        })

        set_containers(newContainers)
    }

    function addTask(containerId: UniqueIdentifier) {
        if (!tasks) {
            return
        }

        const newTask: KanbanTaskData = {
            id: createId(),
            container_id: containerId,
            content: 'New Item'
        }

        set_tasks([...tasks, newTask])
    }

    function deleteTask(taskId: UniqueIdentifier) {
        if (!tasks) {
            return
        }

        const newTasks = tasks.filter((task) => task.id !== taskId)
        set_tasks(newTasks)
    }

    function updateTask(taskId: UniqueIdentifier, content: string) {
        if (!tasks) {
            return
        }

        const newTasks = tasks.map((task) => {
            if (task.id === taskId) return { ...task, content }

            return task
        })

        set_tasks(newTasks)
    }

    function onDragStart(event: DragStartEvent) {
        if (event.active.data.current?.type === 'container') {
            setActiveContainer(
                event.active.data.current.container_data as KanbanContainerData
            )

            return
        }

        if (event.active.data.current?.type === 'task') {
            setActiveTask(event.active.data.current.task_data as KanbanTaskData)

            return
        }
    }

    function onDragEnd(event: DragEndEvent) {
        setActiveContainer(null)
        setActiveTask(null)

        const { active, over } = event
        if (!over) return

        const active_id = active.id
        const over_id = over.id

        if (active_id === over_id) return

        set_containers((prev) => {
            const active_container_index = prev.findIndex(
                (container) => container.id === active_id
            )
            const over_container_index = prev.findIndex(
                (container) => container.id === over_id
            )

            return arrayMove(prev, active_container_index, over_container_index)
        })
    }

    function onDragOver(event: DragOverEvent) {
        const { active, over } = event
        if (!over) return

        const active_id = active.id
        const over_id = over.id

        if (active_id === over_id) return

        // Dropping task over task
        const isActiveTask = active.data.current?.type === 'task'
        const isOverTask = over.data.current?.type === 'task'

        if (!isActiveTask) return

        if (isActiveTask && isOverTask) {
            set_tasks((prev) => {
                const active_index = prev.findIndex((task) => task.id === active_id)
                const over_index = prev.findIndex((task) => task.id === over_id)

                if (prev[active_index]?.container_id !== prev[over_index]?.container_id) {
                    prev[active_index]!.container_id = prev[over_index]!.container_id
                }

                return arrayMove(prev, active_index, over_index)
            })
        }

        const isOverContainer = over.data.current?.type === 'container'
        if (isActiveTask && isOverContainer) {
            set_tasks((prev) => {
                const active_index = prev.findIndex((task) => task.id === active_id)

                prev[active_index]!.container_id = over_id

                return arrayMove(prev, active_index, active_index)
            })
        }
    }

    return (
        <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
        >
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Kanban</CardTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                disabled={saveKanban.isPending}
                                onClick={() => {
                                    saveKanban.mutate({
                                        kanban_id,
                                        containers: JSON.stringify(containers),
                                        tasks: JSON.stringify(tasks)
                                    })
                                }}
                            >
                                <Save className="size-4" />
                                Save
                            </Button>
                            <Button onClick={addContainer}>
                                <Plus className="size-4" />
                                Add Container
                            </Button>
                        </div>
                    </div>
                    <Separator className="my-5 w-full" />
                </CardHeader>
                <CardContent>
                    <SortableContext items={containerIds}>
                        <div className="columns-1 gap-4 sm:columns-2 md:columns-3">
                            {containers?.map((container) => (
                                <Container
                                    key={container.id}
                                    container={container}
                                    tasks={
                                        tasks?.filter(
                                            (task) => task.container_id === container.id
                                        ) ?? []
                                    }
                                    add_task={addTask}
                                    delete_task={deleteTask}
                                    update_task={updateTask}
                                    delete_container={deleteContainer}
                                    update_container={updateContainer}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </CardContent>
            </Card>
            <DragOverlay>
                {activeContainer && (
                    <Container
                        container={activeContainer}
                        tasks={
                            tasks?.filter(
                                (task) => task.container_id === activeContainer.id
                            ) ?? []
                        }
                        add_task={addTask}
                        delete_task={deleteTask}
                        update_task={updateTask}
                        delete_container={deleteContainer}
                        update_container={updateContainer}
                    />
                )}
                {activeTask && (
                    <Task
                        task={activeTask}
                        update_task={updateTask}
                        delete_task={deleteTask}
                    />
                )}
            </DragOverlay>
        </DndContext>
    )
}

function Container(props: {
    container: KanbanContainerData
    tasks: KanbanTaskData[]
    add_task: (container_id: UniqueIdentifier) => void
    delete_task: (task_id: UniqueIdentifier) => void
    update_task: (task_id: UniqueIdentifier, content: string) => void
    delete_container: (container_id: UniqueIdentifier) => void
    update_container: (container_id: UniqueIdentifier, title: string) => void
}) {
    const [editMode, setEditMode] = useState(false)

    const { setNodeRef, attributes, listeners, transition, transform, isDragging } =
        useSortable({
            id: props.container.id,
            data: {
                type: 'container',
                container_data: props.container
            },
            disabled: editMode
        })

    const taskIds = useMemo(() => {
        return props.tasks.map((task) => task.id)
    }, [props.tasks])

    const style = {
        transition,
        transform: CSS.Translate.toString(transform)
    }

    if (isDragging) {
        return (
            <Card
                className="bg-background mb-4 flex flex-1 break-inside-avoid flex-col"
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <CardHeader>
                    <CardTitle>{props.container.title}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-2">
                        <SortableContext items={taskIds}>
                            {props.tasks.map((task) => (
                                <Task
                                    key={task.id}
                                    task={task}
                                    update_task={props.update_task}
                                    delete_task={props.delete_task}
                                />
                            ))}
                        </SortableContext>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card
            className="bg-background mb-4 flex flex-1 break-inside-avoid flex-col"
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >
            <CardHeader>
                <div className="flex items-center justify-between">
                    {!editMode ? (
                        <CardTitle onClick={() => setEditMode(true)}>
                            {props.container.title}
                        </CardTitle>
                    ) : (
                        <Input
                            value={props.container.title}
                            autoFocus
                            onChange={(e) =>
                                props.update_container(props.container.id, e.target.value)
                            }
                            onBlur={() => setEditMode(false)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return

                                setEditMode(false)
                            }}
                        />
                    )}
                    <div className="flex items-center gap-2">
                        <Button
                            variant={'ghost'}
                            onClick={() => props.add_task(props.container.id)}
                        >
                            <Plus className="size-4" />
                        </Button>
                        <Button
                            variant={'ghost'}
                            onClick={() => props.delete_container(props.container.id)}
                            className="hover:bg-destructive"
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                </div>
                <Separator className="my-5 w-full" />
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-2">
                    <SortableContext items={taskIds}>
                        {props.tasks.map((task) => (
                            <Task
                                key={task.id}
                                task={task}
                                update_task={props.update_task}
                                delete_task={props.delete_task}
                            />
                        ))}
                    </SortableContext>
                </div>
            </CardContent>
        </Card>
    )
}

function Task(props: {
    task: KanbanTaskData
    update_task: (task_id: UniqueIdentifier, content: string) => void
    delete_task: (task_id: UniqueIdentifier) => void
}) {
    const [editMode, setEditMode] = useState(false)

    const { setNodeRef, attributes, listeners, transition, transform, isDragging } =
        useSortable({
            id: props.task.id,
            data: {
                type: 'task',
                task_data: props.task
            },
            disabled: editMode
        })

    const style = {
        transition,
        transform: CSS.Translate.toString(transform)
    }

    if (isDragging) {
        return (
            <Card ref={setNodeRef} style={style} {...attributes} {...listeners}>
                <CardContent className="p-5">
                    <CardTitle>{props.task.content}</CardTitle>
                </CardContent>
            </Card>
        )
    }

    if (editMode) {
        return (
            <Card ref={setNodeRef} style={style} {...attributes} {...listeners}>
                <CardContent className="p-5">
                    <Input
                        defaultValue={props.task.content}
                        placeholder="Type something here"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()

                                props.update_task(props.task.id, e.currentTarget.value)
                                setEditMode(false)
                            }
                        }}
                        onBlur={(e) => {
                            props.update_task(props.task.id, e.currentTarget.value)
                            setEditMode(false)
                        }}
                    />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <CardContent className="flex items-center justify-between p-5">
                <CardTitle onClick={() => setEditMode(true)} className="w-full">
                    {props.task.content}
                </CardTitle>
                <div className="flex">
                    <Button
                        variant={'ghost'}
                        onClick={() => props.delete_task(props.task.id)}
                        className="hover:bg-destructive"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
