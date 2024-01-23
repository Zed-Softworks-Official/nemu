import { UniqueIdentifier } from '@dnd-kit/core'

/**
 * KanbanItem
 * Data for kanban items
 *
 * @prop {UniqueIdentifier} id - The id for the
 * @prop {string} title -
 */
export interface KanbanItem {
    id: UniqueIdentifier
    title: string
}

/**
 * KanbanData
 * Data for kanban
 *
 * @prop {UniqueIdentifier} id -
 * @prop {string} title -
 * @prop {KanbanItem[]} items -
 */
export interface KanbanData {
    id: UniqueIdentifier
    title: string
    items: KanbanItem[]
}
