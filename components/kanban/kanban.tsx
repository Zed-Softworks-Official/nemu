'use client'

import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import KanbanContainerComponent from './kanban-container'
import { KanbanData, KanbanItem } from '@/core/structures'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, UniqueIdentifier, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove } from '@dnd-kit/sortable'

export default function Kanban() {
    const [containers, setContainers] = useState<KanbanData[]>([])
    const containerId = useMemo(() => containers.map((container) => container.id), [containers])

    const [activeContainer, setActiveContainer] = useState<KanbanData | null>(null)
    const sesnors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3 // 300px
            }
        })
    )

    function CreateNewContainer() {
        const containerToAdd: KanbanData = {
            id: crypto.randomUUID(),
            title: `Container ${containers.length + 1}`,
            items: []
        }

        setContainers([...containers, containerToAdd])
    }

    function DeleteContainer(container_id: UniqueIdentifier) {
        const filteredContainers = containers.filter((container) => container.id !== container_id)
        setContainers(filteredContainers)
    }

    function UpdateContainer(container_id: UniqueIdentifier, title: string) {
        const newContainers = containers.map((container) => {
            if (container.id !== container_id) return container

            return { ...container, title }
        })

        setContainers(newContainers)
    }

    function CreateTask(container_id: UniqueIdentifier) {
        const newItem: KanbanItem = {
            id: crypto.randomUUID(),
            content: 'New Item'
        }

        const newContainers = containers.map((container) => {
            if (container.id !== container_id) return container

            container.items.push(newItem)
            return { ...container }
        })

        setContainers(newContainers)
    }

    function OnDragStart(event: DragStartEvent) {
        if (event.active.data.current?.type === 'Container') {
            setActiveContainer(event.active.data.current.container_data)
            return
        }
    }

    function OnDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (!over) return

        const activeContainerId = active.id
        const overContainerId = over.id

        if (activeContainerId === overContainerId) return

        setContainers((containers) => {
            const activeContainerIndex = containers.findIndex((container) => container.id === activeContainerId)
            const overContainerIndex = containers.findIndex((container) => container.id === overContainerId)

            return arrayMove(containers, activeContainerIndex, overContainerIndex)
        })
    }

    return (
        <DndContext sensors={sesnors} onDragStart={OnDragStart} onDragEnd={OnDragEnd}>
            <div className="card bg-base-100">
                <div className="card-body gap-5">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Kanban for someone</h2>
                        <button type="button" className="btn btn-primary" onClick={() => CreateNewContainer()}>
                            <PlusCircleIcon className="w-6 h-6" />
                            Add Container
                        </button>
                    </div>
                    <div className="divider"></div>

                    <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 980: 2, 1280: 3 }}>
                        <SortableContext items={containerId}>
                            <Masonry gutter="3rem">
                                {containers.map((container) => (
                                    <KanbanContainerComponent
                                        key={container.id}
                                        container_data={container}
                                        DeleteContainer={DeleteContainer}
                                        UpdateContainer={UpdateContainer}
                                        CreateTask={CreateTask}
                                    />
                                ))}
                            </Masonry>
                        </SortableContext>
                    </ResponsiveMasonry>
                </div>
            </div>
            <DragOverlay>
                {activeContainer && (
                    <KanbanContainerComponent
                        container_data={activeContainer}
                        DeleteContainer={DeleteContainer}
                        UpdateContainer={UpdateContainer}
                        CreateTask={CreateTask}
                    />
                )}
            </DragOverlay>
        </DndContext>
    )
}
