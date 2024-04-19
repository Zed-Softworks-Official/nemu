'use client'

import FormElementSidebar from '~/components/form-builder/elements/form-elements-sidebar'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import PropertiesFormSidebar from '~/components/form-builder/designer/properties-form-sidebar'

export default function DesignerSidebar() {
    const { selectedElement } = useDesigner()

    return (
        <aside className="w-[400px] max-w-[400px] flex flex-col flex-grow gap-2 border-base-200 bg-base-300/60 backdrop-blur-3xl p-4 overflow-y-auto h-full">
            {!selectedElement ? <FormElementSidebar /> : <PropertiesFormSidebar />}
        </aside>
    )
}
