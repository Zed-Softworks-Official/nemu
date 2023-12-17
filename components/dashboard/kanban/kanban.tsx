'use client'

import { useState } from 'react'
import {
    DndContext,
    DragEndEvent,
    DragMoveEvent,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    UniqueIdentifier,
    closestCorners,
    useSensor,
    useSensors
} from '@dnd-kit/core'

import { v4 as uuidv4 } from 'uuid'
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates
} from '@dnd-kit/sortable'
import KanbanDroppable from './kanban-container'
import KanbanItem from './kanban-item'

type DNDType = {
    id: UniqueIdentifier
    title: string
    items: {
        id: UniqueIdentifier
        title: string
    }[]
}

export default function Kanban({ title, client }: { title: string; client: string }) {
    const [containers, setContainers] = useState<DNDType[]>([
        {
            id: `container-${uuidv4()}`,
            title: 'Todo',
            items: [
                {
                    id: `item-${uuidv4()}`,
                    title: 'Colour Logo'
                },
                {
                    id: `item-${uuidv4()}`,
                    title: 'Sketch Background'
                }
            ]
        },
        {
            id: `container-${uuidv4()}`,
            title: 'Done',
            items: [
                {
                    id: `item-${uuidv4()}`,
                    title: 'Sketch Logo'
                }
            ]
        }
    ])

    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
    const [currentContainerId, setCurrentContainerId] = useState<UniqueIdentifier>()
    const [containerName, setContainerName] = useState('')
    const [itemName, setItemName] = useState('')
    const [showAddContainerModal, setShowAddContainerModal] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    )

    function findValueOfItems(
        id: UniqueIdentifier | undefined,
        type: 'container' | 'item'
    ) {
        if (type === 'container') {
            return containers.find((item) => item.id === id)
        }

        if (type === 'item') {
            return containers.find((container) =>
                container.items.find((item) => item.id === id)
            )
        }
    }

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event
        const { id } = active

        setActiveId(id)
    }

    const handleDragMove = (event: DragMoveEvent) => {
        const { active, over } = event

        // Handle Items Sorting
        if (
            active.id.toString().includes('item') &&
            over?.id.toString().includes('item') &&
            active &&
            over &&
            active.id !== over.id
        ) {
            // Find the active container and over container
            const activeContainer = findValueOfItems(active.id, 'item')
            const overContainer = findValueOfItems(over.id, 'item')

            // If the active or over container is not found, return
            if (!activeContainer || !overContainer) return

            // Find the index of the active and over container
            const activeContainerIndex = containers.findIndex(
                (container) => container.id === activeContainer.id
            )
            const overContainerIndex = containers.findIndex(
                (container) => container.id === overContainer.id
            )

            // Find the index of the active and over item
            const activeItemIndex = activeContainer.items.findIndex(
                (item) => item.id === over.id
            )
            const overItemIndex = overContainer.items.findIndex(
                (item) => item.id === over.id
            )

            // Move them if they're in the same container
            if (activeContainerIndex === overContainerIndex) {
                let newItems = [...containers]
                newItems[activeContainerIndex].items = arrayMove(
                    newItems[activeContainerIndex].items,
                    activeItemIndex,
                    overItemIndex
                )

                setContainers(newItems)
            } else {
                // Otherwise move them in different containers
                let newItems = [...containers]
                const [removedItem] = newItems[activeContainerIndex].items.splice(
                    activeItemIndex,
                    1
                )

                newItems[overContainerIndex].items.splice(overItemIndex, 0, removedItem)
                setContainers(newItems)
            }
        }

        // Handling Item drop into container
        if (
            active.id.toString().includes('item') &&
            over?.id.toString().includes('container') &&
            active &&
            over &&
            active.id !== over.id
        ) {
            // Find the active and over container
            const activeContainer = findValueOfItems(active.id, 'item')
            const overContainer = findValueOfItems(over.id, 'container')

            // If the active or over container is not found, return
            if (!activeContainer || !overContainer) return

            // Find the index of the active and over container
            const activeContainerIndex = containers.findIndex(
                (container) => container.id === activeContainer.id
            )
            const overContainerIndex = containers.findIndex(
                (container) => container.id === overContainer.id
            )

            // Find the index of the active and over item
            const activeItemIndex = activeContainer.items.findIndex(
                (item) => item.id === active.id
            )

            let newItems = [...containers]
            const [removedItem] = newItems[activeContainerIndex].items.splice(
                activeItemIndex,
                1
            )
            newItems[overContainerIndex].items.push(removedItem)
            setContainers(newItems)
        }
    }
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        // Handling Container Sorting

    }

    return (
        <>
            <div className="flex items-center justify-between gap-y-2">
                <h1>
                    {title} form {client}
                </h1>
            </div>
            <div className="grid grid-cols-3 gap-6">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={containers.map((i) => i.id)}>
                        {containers.map((container) => (
                            <KanbanDroppable
                                id={container.id}
                                title={container.title}
                                key={container.id}
                                onAddItem={() => {}}
                            >
                                <SortableContext items={container.items.map((i) => i.id)}>
                                    {container.items.map((i) => (
                                        <KanbanItem
                                            title={i.title}
                                            id={i.id}
                                            key={i.id}
                                        />
                                    ))}
                                </SortableContext>
                            </KanbanDroppable>
                        ))}
                    </SortableContext>
                </DndContext>
            </div>
        </>
    )
}
