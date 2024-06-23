'use client'

import { type Dispatch, type SetStateAction, createContext, useContext, useState } from 'react'
import type { FormElementInstance } from '~/components/form-builder/elements/form-elements'

type DesignerContextType = {
    elements: FormElementInstance[]
    setElements: Dispatch<SetStateAction<FormElementInstance[]>>
    addElement: (index: number, element: FormElementInstance) => void
    removeElement: (id: string) => void

    selectedElement: FormElementInstance | null
    setSelectedElement: Dispatch<SetStateAction<FormElementInstance | null>>

    updateElement: (id: string, element: FormElementInstance) => void
}

const DesignerContext = createContext<DesignerContextType | null>(null)

export function DesignerProvider({
    initial_elements,
    children
}: {
    initial_elements: FormElementInstance[]
    children: React.ReactNode
}) {
    const [elements, setElements] = useState<FormElementInstance[]>(initial_elements)
    const [selectedElement, setSelectedElement] = useState<FormElementInstance | null>(
        null
    )

    const addElement = (index: number, element: FormElementInstance) => {
        setElements((prev) => {
            const newElements = [...prev]
            newElements.splice(index, 0, element)

            return newElements
        })
    }

    const removeElement = (id: string) => {
        setElements((prev) => prev.filter((element) => element.id !== id))
    }

    const updateElement = (id: string, element: FormElementInstance) => {
        setElements((prev) => {
            const newElements = [...prev]
            const index = newElements.findIndex((element) => element.id === id)

            newElements[index] = element
            return newElements
        })
    }

    return (
        <DesignerContext.Provider
            value={{
                elements,
                setElements,
                addElement,
                removeElement,
                selectedElement,
                setSelectedElement,
                updateElement
            }}
        >
            {children}
        </DesignerContext.Provider>
    )
}

export const useDesigner = () => useContext(DesignerContext)!
