import { UniqueIdentifier } from '@dnd-kit/core'

/**
 * Data for kanban tasks
 *
 * @prop {UniqueIdentifier} id - The id for the task
 * @prop {UniqueIdentifier} container_id - The id of the container that the task belongs to
 * @prop {string} content - The content of the task
 */
export interface KanbanTask {
    id: UniqueIdentifier
    container_id: UniqueIdentifier
    content: string
}

/**
 * Data for kanban
 *
 * @prop {UniqueIdentifier} id - The id for the container
 * @prop {string} title - The title of the container
 */
export interface KanbanContainerData {
    id: UniqueIdentifier
    title: string
}
