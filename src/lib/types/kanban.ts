import type { UniqueIdentifier } from '@dnd-kit/core'

/**
 * Data for kanban tasks
 *
 * @prop {UniqueIdentifier} id - The id for the task
 * @prop {UniqueIdentifier} container_id - The id of the container that the task belongs to
 * @prop {string} content - The content of the task
 */
export type KanbanTaskData = {
    id: UniqueIdentifier
    containerId: UniqueIdentifier
    content: string
}

/**
 * Data for kanban
 *
 * @prop {UniqueIdentifier} id - The id for the container
 * @prop {string} title - The title of the container
 */
export type KanbanContainerData = {
    id: UniqueIdentifier
    title: string
}

/**
 * Data for kanban tasks
 *
 * @prop {string} id - The id for the task
 * @prop {KanbanContainerData[]} container_id - The id of the container that the task belongs to
 * @prop {KanbanTask[]} content - The content of the task
 */
export type KanbanMessagesDataType = {
    id: string
    containers: KanbanContainerData[]
    tasks: KanbanTaskData[]
}
