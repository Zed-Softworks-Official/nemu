import SidebarBtnElement from '../designer/sidebar-btn-element'
import { FormElements } from './form-elements'

export default function FormElementSidebar() {
    return (
        <>
            <h2 className="text-base-content/80">Drag and drop elements</h2>
            <div className="grid grid-cols-2 gap-3">
                <SidebarBtnElement formElement={FormElements.TextField} />
            </div>
        </>
    )
}
