'use client'

import {
    createContext,
    type Dispatch,
    type SetStateAction,
    useContext,
    useState
} from 'react'
import type { FormElementInstance } from '~/components/form-builder/elements/form-elements'

type DesignerContextType = {
    elements: FormElementInstance[]
    set_elements: Dispatch<SetStateAction<FormElementInstance[]>>

    add_element: (index: number, element: FormElementInstance) => void
    update_element: (id: string, element: FormElementInstance) => void
    remove_element: (id: string) => void

    selected_element: FormElementInstance | null
    set_selected_element: Dispatch<SetStateAction<FormElementInstance | null>>
}

const DesignerContext = createContext<DesignerContextType | null>(null)

export default function DesignerProvider(props: { children: React.ReactNode }) {
    const [elements, setElements] = useState<FormElementInstance[]>([])
    const [selectedElement, setSelectedElement] = useState<FormElementInstance | null>(
        null
    )

    const add_element = (index: number, element: FormElementInstance) => {
        setElements((prev) => [...prev.slice(0, index), element, ...prev.slice(index)])
    }

    const remove_element = (id: string) => {
        setElements((prev) => prev.filter((element) => element.id !== id))
    }

    const update_element = (id: string, element: FormElementInstance) => {
        setElements((prev) => prev.map((e) => (e.id === id ? element : e)))
    }

    return (
        <DesignerContext.Provider
            value={{
                elements,
                set_elements: setElements,
                add_element,
                remove_element,
                update_element,
                selected_element: selectedElement,
                set_selected_element: setSelectedElement
            }}
        >
            {props.children}
        </DesignerContext.Provider>
    )
}

export const useDesigner = () => {
    const context = useContext(DesignerContext)

    if (!context) {
        throw new Error('useDesigner must be used within a DesignerProvider')
    }

    return context
}
