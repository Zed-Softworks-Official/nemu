import { forwardRef, InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    description: React.ReactNode
}

export const InputField = forwardRef<HTMLInputElement, InputProps>(
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

export const CheckboxField = forwardRef<HTMLInputElement, InputProps>(
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
