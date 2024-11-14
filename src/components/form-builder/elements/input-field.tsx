import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    description: React.ReactNode
}

export interface TextAreaInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label: string
    description: React.ReactNode
}

export const DesignerInputField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, description, type, ...props }, ref) => {
        return (
            <>
                <div className="mb-5">
                    <label htmlFor={label} className="mb-5 block">
                        {label}:
                    </label>
                    <input type={type} ref={ref} {...props} className="input w-full" />
                </div>
                <div className="text-base-content/80">{description}</div>
                <div className="divider"></div>
            </>
        )
    }
)
DesignerInputField.displayName = 'DesignerInputField'

export const DesignerRangeField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, description, ...props }, ref) => {
        return (
            <>
                <div className="mb-5">
                    <label htmlFor={label} className="mb-5 block">
                        {label}:
                    </label>
                    <input
                        type="range"
                        ref={ref}
                        {...props}
                        className="range range-primary"
                    />
                </div>
                <div className="text-base-content/80">{description}</div>
                <div className="divider"></div>
            </>
        )
    }
)
DesignerRangeField.displayName = 'DesignerRangeField'

export const DesignerCheckboxField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, description, type, ...props }, ref) => {
        return (
            <>
                <div className="form-control">
                    <label htmlFor={props.name} className="label cursor-pointer">
                        <span className="label-text">{label}:</span>
                        <input
                            type={type}
                            ref={ref}
                            {...props}
                            className="toggle toggle-primary"
                        />
                    </label>
                </div>
                <div className="text-base-content/80">{description}</div>
                <div className="divider"></div>
            </>
        )
    }
)
DesignerCheckboxField.displayName = 'DesignerCheckboxField'

export const DesignerTextAreaField = forwardRef<HTMLTextAreaElement, TextAreaInputProps>(
    ({ label, description, ...props }, ref) => {
        return (
            <>
                <div className="mb-5">
                    <label htmlFor={label} className="mb-5 block">
                        {label}:
                    </label>
                    <textarea
                        ref={ref}
                        {...props}
                        className="textarea h-36 w-full"
                    ></textarea>
                </div>
                <div className="text-base-content/80">{description}</div>
                <div className="divider"></div>
            </>
        )
    }
)
DesignerTextAreaField.displayName = 'DesignerTextAreaField'
