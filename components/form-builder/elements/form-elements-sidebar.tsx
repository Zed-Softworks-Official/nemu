import SidebarBtnElement from '../designer/sidebar-btn-element'
import { FormElements } from './form-elements'

export default function FormElementSidebar() {
    return (
        <>
            <h2 className="text-base-content/80 text-center pt-5">
                Drag and drop elements
            </h2>
            <div className="divider"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="divider col-span-1 md:col-span-2">Layout Elements</div>
                <SidebarBtnElement formElement={FormElements.TitleField} />
                <SidebarBtnElement formElement={FormElements.SubTitleField} />
                <SidebarBtnElement formElement={FormElements.ParagraphField} />
                <SidebarBtnElement formElement={FormElements.DividerField} />
                <SidebarBtnElement formElement={FormElements.SpacerField} />
                <div className="divider col-span-1 md:col-span-2">Input Elements</div>
                <SidebarBtnElement formElement={FormElements.TextField} />
                <SidebarBtnElement formElement={FormElements.NumberField} />
                <SidebarBtnElement formElement={FormElements.TextAreaField} />
                <SidebarBtnElement formElement={FormElements.DateField} />
                <SidebarBtnElement formElement={FormElements.SelectField} />
            </div>
        </>
    )
}
