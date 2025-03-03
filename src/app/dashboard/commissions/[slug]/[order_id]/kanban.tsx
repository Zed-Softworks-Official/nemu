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

import type { KanbanContainerData, KanbanTaskData } from '~/lib/types'
import { Input } from '~/components/ui/input'
import { api } from '~/trpc/react'
import { toast } from 'sonner'

export function Kanban() {
    const [activeContainer, setActiveContainer] = useState<KanbanContainerData | null>(
        null
    )
    const [activeTask, setActiveTask] = useState<KanbanTaskData | null>(null)

    const { containers, tasks, setContainers, setTasks, kanbanId } = useDashboardOrder()
    const saveKanban = api.kanban.updateKanban.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Saving Kanban...')

            return { toastId }
        },
        onError: (_, __, context) => {
            if (!context?.toastId) return

            toast.error('Failed to save Kanban', {
                id: context.toastId
            })
        },
        onSuccess: (_, __, context) => {
            if (!context?.toastId) return

            toast.success('Kanban Saved!', {
                id: context.toastId
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

        setContainers([...containers, containerData])
    }

    function deleteContainer(containerId: UniqueIdentifier) {
        if (!containers || !tasks) {
            return
        }

        const filteredContainers = containers.filter(
            (container) => container.id !== containerId
        )

        setContainers(filteredContainers)

        const newTasks = tasks.filter((task) => task.containerId !== containerId)
        setTasks(newTasks)
    }

    function updateContainer(containerId: UniqueIdentifier, title: string) {
        if (!containers) {
            return
        }

        const newContainers = containers.map((container) => {
            if (container.id !== containerId) return container

            return { ...container, title }
        })

        setContainers(newContainers)
    }

    function addTask(containerId: UniqueIdentifier) {
        if (!tasks) {
            return
        }

        const newTask: KanbanTaskData = {
            id: createId(),
            containerId: containerId,
            content: 'New Item'
        }

        setTasks([...tasks, newTask])
    }

    function deleteTask(taskId: UniqueIdentifier) {
        if (!tasks) {
            return
        }

        const newTasks = tasks.filter((task) => task.id !== taskId)
        setTasks(newTasks)
    }

    function updateTask(taskId: UniqueIdentifier, content: string) {
        if (!tasks) {
            return
        }

        const newTasks = tasks.map((task) => {
            if (task.id === taskId) return { ...task, content }

            return task
        })

        setTasks(newTasks)
    }

    function onDragStart(event: DragStartEvent) {
        if (event.active.data.current?.type === 'container') {
            setActiveContainer(
                event.active.data.current.containerData as KanbanContainerData
            )

            return
        }

        if (event.active.data.current?.type === 'task') {
            setActiveTask(event.active.data.current.taskData as KanbanTaskData)

            return
        }
    }

    function onDragEnd(event: DragEndEvent) {
        setActiveContainer(null)
        setActiveTask(null)

        const { active, over } = event
        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        setContainers((prev) => {
            const activeContainerIndex = prev.findIndex(
                (container) => container.id === activeId
            )
            const overContainerIndex = prev.findIndex(
                (container) => container.id === overId
            )

            return arrayMove(prev, activeContainerIndex, overContainerIndex)
        })
    }

    function onDragOver(event: DragOverEvent) {
        const { active, over } = event
        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        // Dropping task over task
        const isActiveTask = active.data.current?.type === 'task'
        const isOverTask = over.data.current?.type === 'task'

        if (!isActiveTask) return

        if (isActiveTask && isOverTask) {
            setTasks((prev) => {
                const activeIndex = prev.findIndex((task) => task.id === activeId)
                const overIndex = prev.findIndex((task) => task.id === overId)

                if (prev[activeIndex]?.containerId !== prev[overIndex]?.containerId) {
                    prev[activeIndex]!.containerId = prev[overIndex]!.containerId
                }

                return arrayMove(prev, activeIndex, overIndex)
            })
        }

        const isOverContainer = over.data.current?.type === 'container'
        if (isActiveTask && isOverContainer) {
            setTasks((prev) => {
                const activeIndex = prev.findIndex((task) => task.id === activeId)

                prev[activeIndex]!.containerId = overId

                return arrayMove(prev, activeIndex, activeIndex)
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
                                        kanbanId,
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
                                            (task) => task.containerId === container.id
                                        ) ?? []
                                    }
                                    addTask={addTask}
                                    deleteTask={deleteTask}
                                    updateTask={updateTask}
                                    deleteContainer={deleteContainer}
                                    updateContainer={updateContainer}
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
                                (task) => task.containerId === activeContainer.id
                            ) ?? []
                        }
                        addTask={addTask}
                        deleteTask={deleteTask}
                        updateTask={updateTask}
                        deleteContainer={deleteContainer}
                        updateContainer={updateContainer}
                    />
                )}
                {activeTask && (
                    <Task
                        task={activeTask}
                        updateTask={updateTask}
                        deleteTask={deleteTask}
                    />
                )}
            </DragOverlay>
        </DndContext>
    )
}

function Container(props: {
    container: KanbanContainerData
    tasks: KanbanTaskData[]
    addTask: (containerId: UniqueIdentifier) => void
    deleteTask: (taskId: UniqueIdentifier) => void
    updateTask: (taskId: UniqueIdentifier, content: string) => void
    deleteContainer: (containerId: UniqueIdentifier) => void
    updateContainer: (containerId: UniqueIdentifier, title: string) => void
}) {
    const [editMode, setEditMode] = useState(false)

    const { setNodeRef, attributes, listeners, transition, transform, isDragging } =
        useSortable({
            id: props.container.id,
            data: {
                type: 'container',
                containerData: props.container
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
                                    updateTask={props.updateTask}
                                    deleteTask={props.deleteTask}
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
                                props.updateContainer(props.container.id, e.target.value)
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
                            onClick={() => props.addTask(props.container.id)}
                        >
                            <Plus className="size-4" />
                        </Button>
                        <Button
                            variant={'ghost'}
                            onClick={() => props.deleteContainer(props.container.id)}
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
                                updateTask={props.updateTask}
                                deleteTask={props.deleteTask}
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
    updateTask: (taskId: UniqueIdentifier, content: string) => void
    deleteTask: (taskId: UniqueIdentifier) => void
}) {
    const [editMode, setEditMode] = useState(false)

    const { setNodeRef, attributes, listeners, transition, transform, isDragging } =
        useSortable({
            id: props.task.id,
            data: {
                type: 'task',
                taskData: props.task
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

                                props.updateTask(props.task.id, e.currentTarget.value)
                                setEditMode(false)
                            }
                        }}
                        onBlur={(e) => {
                            props.updateTask(props.task.id, e.currentTarget.value)
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
                        onClick={() => props.deleteTask(props.task.id)}
                        className="hover:bg-destructive"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
