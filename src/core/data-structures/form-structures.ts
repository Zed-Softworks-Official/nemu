export type ClientForm = {
    id: string
    name: string
    description: string
    content?: string
}

export type RequestContent = {
    [key: string]: { value: string; label: string }
}