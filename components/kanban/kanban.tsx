'use client'

import { useState } from 'react'
import {
    DndContext,
    DragEndEvent,
    DragMoveEvent,
    DragOverlay,
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
import Modal from '../modal'
import KanbanContainer from './kanban-container'
import { KanbanData } from '@/core/structures'

export default function Kanban({ title, client }: { title: string; client: string }) {
    const [containers, setContainers] = useState<KanbanData[]>([
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
            title: 'In Progress',
            items: [
                {
                    id: `item-${uuidv4()}`,
                    title: 'Something'
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
    const [showAddItemModal, setShowAddItemModal] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    )

    function onAddContainer() {
        if (!containerName) return

        const id = `container-${uuidv4()}`
        setContainers([
            ...containers,
            {
                id,
                title: containerName,
                items: []
            }
        ])
        setContainerName('')
        setShowAddContainerModal(false)
    }

    function onAddItem() {
        if (!itemName) return
        const id = `item-${uuidv4()}`
        const container = containers.find((item) => item.id === currentContainerId)

        if (!container) return
        container.items.push({
            id,
            title: itemName
        })

        setContainers([...containers])
        setItemName('')
        setShowAddItemModal(false)
    }

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

    function findItemTitle(id: UniqueIdentifier | undefined) {
        const container = findValueOfItems(id, 'item')
        if (!container) return ''

        const item = container.items.find((item) => item.id === id)
        if (!item) return ''

        return item.title
    }

    function findContainerTitle(id: UniqueIdentifier | undefined) {
        const container = findValueOfItems(id, 'container')
        if (!container) return ''

        return container.title
    }

    function findContainerItems(id: UniqueIdentifier | undefined) {
        const container = findValueOfItems(id, 'container')
        if (!container) return []

        return container.items
    }

    function handleDragStart(event: DragStartEvent) {
        const { active } = event
        const { id } = active

        setActiveId(id)
    }

    function handleDragMove(event: DragMoveEvent) {
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
            const activeitemIndex = activeContainer.items.findIndex(
                (item) => item.id === active.id
            )
            const overitemIndex = overContainer.items.findIndex(
                (item) => item.id === over.id
            )
            // In the same container
            if (activeContainerIndex === overContainerIndex) {
                let newItems = [...containers]
                newItems[activeContainerIndex].items = arrayMove(
                    newItems[activeContainerIndex].items,
                    activeitemIndex,
                    overitemIndex
                )

                setContainers(newItems)
            } else {
                // In different containers
                let newItems = [...containers]
                const [removeditem] = newItems[activeContainerIndex].items.splice(
                    activeitemIndex,
                    1
                )
                newItems[overContainerIndex].items.splice(overitemIndex, 0, removeditem)
                setContainers(newItems)
            }
        }

        // Handling Item Drop Into a Container
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
            const activeitemIndex = activeContainer.items.findIndex(
                (item) => item.id === active.id
            )

            // Remove the active item from the active container and add it to the over container
            let newItems = [...containers]
            const [removeditem] = newItems[activeContainerIndex].items.splice(
                activeitemIndex,
                1
            )
            newItems[overContainerIndex].items.push(removeditem)
            setContainers(newItems)
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        // Handling Container Sorting
        if (
            active.id.toString().includes('container') &&
            over?.id.toString().includes('container') &&
            active &&
            over &&
            active.id !== over.id
        ) {
            // Find the index of the active and over container
            const activeContainerIndex = containers.findIndex(
                (container) => container.id === active.id
            )
            const overContainerIndex = containers.findIndex(
                (container) => container.id === over.id
            )

            let newItems = [...containers]
            newItems = arrayMove(newItems, activeContainerIndex, overContainerIndex)
            setContainers(newItems)
        }

        // Handle Item Sorting
        if (
            active.id.toString().includes('item') &&
            over?.id.toString().includes('item') &&
            active &&
            over &&
            active.id !== over.id
        ) {
            // Find the active and over container
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
                (item) => item.id === active.id
            )
            const overItemIndex = overContainer.items.findIndex(
                (item) => item.id === over.id
            )

            // If they're in the same container
            if (activeContainerIndex === overContainerIndex) {
                let newItems = [...containers]
                newItems[activeContainerIndex].items = arrayMove(
                    newItems[activeContainerIndex].items,
                    activeItemIndex,
                    overItemIndex
                )

                setContainers(newItems)
            } else {
                // Otherwise they're in different containers
                let newItems = [...containers]
                const [removedItem] = newItems[activeContainerIndex].items.splice(
                    activeItemIndex,
                    1
                )

                newItems[overContainerIndex].items.splice(overItemIndex, 0, removedItem)
                setContainers(newItems)
            }
        }
    }

    return (
        <>
            <div className="flex items-center justify-between gap-y-2">
                <h1 className='card-title'>
                    Kanban for {client}
                </h1>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowAddContainerModal(true)}
                >
                    Add Container
                </button>
            </div>
            <div className='divider'></div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
                                onAddItem={() => {
                                    setShowAddItemModal(true)
                                    setCurrentContainerId(container.id)
                                }}
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
                    <DragOverlay>
                        {activeId && activeId.toString().includes('item') && (
                            <KanbanItem id={activeId} title={findItemTitle(activeId)} />
                        )}
                        {activeId && activeId.toString().includes('container') && (
                            <KanbanContainer
                                id={activeId}
                                title={findContainerTitle(activeId)}
                            >
                                {findContainerItems(activeId).map((i) => (
                                    <KanbanItem key={i.id} title={i.title} id={i.id} />
                                ))}
                            </KanbanContainer>
                        )}
                    </DragOverlay>
                </DndContext>
            </div>
            <Modal showModal={showAddItemModal} setShowModal={setShowAddItemModal}>
                <h3 className="font-bold text-lg">Add Item</h3>
                <input
                    type="text"
                    className="input input-ghost bg-base-300 w-full"
                    placeholder="Item Title"
                    defaultValue={itemName}
                    onChange={(e) => setItemName(e.currentTarget.value)}
                />
                <button
                    type="button"
                    className="btn btn-primary w-full"
                    onClick={onAddItem}
                >
                    Add Item
                </button>
            </Modal>
            <Modal
                showModal={showAddContainerModal}
                setShowModal={setShowAddContainerModal}
            >
                <h3 className="font-bold text-lg">Add Container</h3>
                <input
                    type="text"
                    className="input input-ghost bg-base-300 w-full"
                    placeholder="Container Title"
                    defaultValue={containerName}
                    onChange={(e) => setContainerName(e.currentTarget.value)}
                />
                <button
                    type="button"
                    className="btn btn-primary w-full"
                    onClick={onAddContainer}
                >
                    Add Item
                </button>
            </Modal>
        </>
    )
}
