import { UniqueIdentifier } from '@dnd-kit/core'

/**
 * KanbanItem
 * Data for kanban items
 *
 * @prop {UniqueIdentifier} id - The id for the
 * @prop {string} title -
 */
export interface KanbanTask {
    id: UniqueIdentifier
    container_id: UniqueIdentifier
    content: string
}

/**
 * KanbanData
 * Data for kanban
 *
 * @prop {UniqueIdentifier} id -
 * @prop {string} title -
 * @prop {KanbanItem[]} items -
 */
export interface KanbanContainerData {
    id: UniqueIdentifier
    title: string
}