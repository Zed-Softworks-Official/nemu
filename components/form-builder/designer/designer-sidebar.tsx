import { FormElements } from '../elements/form-elements'
import SidebarBtnElement from './sidebar-btn-element'

export default function DesignerSidebar() {
    return (
        <aside className="w-[400px] max-w-[400px] flex flex-col flex-grow gap-2 border-base-200 bg-base-300/60 backdrop-blur-3xl p-4 overflow-y-auto h-full">
            <h2>Drag and drop elements</h2>
            <div className="grid grid-cols-2 gap-3">
                <SidebarBtnElement formElement={FormElements.TextField} />
            </div>
        </aside>
    )
}
