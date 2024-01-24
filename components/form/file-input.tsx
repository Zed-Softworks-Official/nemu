import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    error?: boolean
    labelDisabled?: boolean
}

const FileField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, labelDisabled, ...props }, ref) => {
        return (
            <div className="form-control">
                <label className="label">{label}:</label>
                <input
                    type="file"
                    ref={ref}
                    title={label}
                    {...props}
                    className="file-input file-input-primary border-0 w-full"
                />
            </div>
        )
    }
)

export default FileField
