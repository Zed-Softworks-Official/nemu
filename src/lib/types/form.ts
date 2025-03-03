export type ClientForm = {
    id: string
    name: string
    description: string
    content?: string
}

export type RequestContent = Record<string, { value: string; label: string }>
