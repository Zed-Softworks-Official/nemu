'use client'

import { Dispatch, SetStateAction, createContext, useContext, useState } from 'react'
import { FormElementInstance } from '../elements/form-elements'

export type DesignerContextType = {
    elements: FormElementInstance[]
    addElement: (index: number, element: FormElementInstance) => void
    removeElement: (id: string) => void

    selectedElement: FormElementInstance | null
    setSelectedElement: Dispatch<SetStateAction<FormElementInstance | null>>

    updateElement: (id: string, element: FormElementInstance) => void
}

const DesignerContext = createContext<DesignerContextType | null>(null)

export function DesignerProvider({ children }: { children: React.ReactNode }) {
    const [elements, setElements] = useState<FormElementInstance[]>([])
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
        setElements(prev => {
            const newElements = [...prev]
            const index = newElements.findIndex(element => element.id === id)

            newElements[index] = element
            return newElements
        })
    }

    return (
        <DesignerContext.Provider
            value={{
                elements,
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

export const useDesigner = () => useContext(DesignerContext)
