import ClassNames from '@/core/helpers'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    error?: boolean
    labelDisabled?: boolean
}

const TextField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, labelDisabled, ...props }, ref) => {
        return (
            <>
                <div className="form-control">
                    {!labelDisabled && <label className="label">{label}:</label>}
                    <input
                        ref={ref}
                        {...props}
                        className={ClassNames(error && 'input-error', 'input w-full')}
                    />
                </div>
            </>
        )
    }
)

export default TextField