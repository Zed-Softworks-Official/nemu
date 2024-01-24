import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

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
                    <label htmlFor={label} className="block mb-5">
                        {label}:
                    </label>
                    <input type={type} ref={ref} {...props} className="input w-full" />
                </div>
                <p className="text-base-content/80">{description}</p>
                <div className="divider"></div>
            </>
        )
    }
)

export const DesignerRangeField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, description, ...props }, ref) => {
        return (
            <>
                <div className="mb-5">
                    <label htmlFor={label} className="block mb-5">
                        {label}:
                    </label>
                    <input
                        type="range"
                        ref={ref}
                        {...props}
                        className="range range-primary"
                    />
                </div>
                <p className="text-base-content/80">{description}</p>
                <div className="divider"></div>
            </>
        )
    }
)

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
                <p className="text-base-content/80">{description}</p>
                <div className="divider"></div>
            </>
        )
    }
)

export const DesignerTextAreaField = forwardRef<HTMLTextAreaElement, TextAreaInputProps>(
    ({ label, description, ...props }, ref) => {
        return (
            <>
                <div className="mb-5">
                    <label htmlFor={label} className="block mb-5">
                        {label}:
                    </label>
                    <textarea
                        ref={ref}
                        {...props}
                        className="textarea w-full h-36"
                    ></textarea>
                </div>
                <p className="text-base-content/80">{description}</p>
                <div className="divider"></div>
            </>
        )
    }
)
