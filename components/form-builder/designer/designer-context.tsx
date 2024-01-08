'use client'

import { createContext, useContext, useState } from 'react'
import { FormElementInstance } from '../elements/form-elements'

export type DesignerContextType = {
    elements: FormElementInstance[]
    addElement: (index: number, element: FormElementInstance) => void
}

const DesignerContext = createContext<DesignerContextType | null>(null)

export function DesignerProvider({
    children
}: {
    children: React.ReactNode
}) {
    const [elements, setElements] = useState<FormElementInstance[]>([])

    const addElement = (index: number, element: FormElementInstance) => {
        setElements((prev) => {
            const newElements = [...prev]
            newElements.splice(index, 0, element)

            return newElements
        })
    }

    return (
        <DesignerContext.Provider value={{ elements, addElement }}>
            {children}
        </DesignerContext.Provider>
    )
}

export const useDesigner = () => useContext(DesignerContext)
