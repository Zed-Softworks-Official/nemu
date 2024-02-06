import { ClassNames } from '@/core/helpers'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    error?: boolean
}

const CheckboxField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, ...props }, ref) => {
        return (
            <>
                <div className="form-control">
                    <label className="label cursor-pointer">
                        <span className="label-text">{label}:</span>
                        <input
                            type="checkbox"
                            ref={ref}
                            {...props}
                            className={ClassNames(
                                error && 'checkbox-error',
                                'checkbox checkbox-primary'
                            )}
                        />
                    </label>
                </div>
            </>
        )
    }
)

export default CheckboxField
