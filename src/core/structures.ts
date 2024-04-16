export * from '~/core/data-structures/user-structures'
export * from '~/core/data-structures/commission-structures'
export * from '~/core/data-structures/kanban-structures'

export interface NemuImageData {
    url: string
    blur_data: string
}

export type OverwriteType<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;