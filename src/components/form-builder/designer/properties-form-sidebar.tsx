'use client'

import { XCircleIcon } from 'lucide-react'
import { FormElements } from '~/components/form-builder/elements/form-elements'
import { useDesigner } from '~/components/form-builder/designer/designer-context'

export default function PropertiesFormSidebar() {
    const { selectedElement, setSelectedElement } = useDesigner()

    if (!selectedElement) return null

    const PropertiesForm = FormElements[selectedElement?.type].properties_component

    return (
        <div className="flex flex-col p-2">
            <div className="flex justify-between items-center">
                <h2 className="text-base-content/80">Element Properties</h2>
                <button
                    className="btn btn-ghost text-base-content/80"
                    onClick={() => setSelectedElement(null)}
                >
                    <XCircleIcon className="w-6 h-6" />
                </button>
            </div>
            <div className="divider"></div>

            <PropertiesForm elementInstance={selectedElement} />
        </div>
    )
}
