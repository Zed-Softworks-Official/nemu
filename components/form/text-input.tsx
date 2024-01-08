import { InputHTMLAttributes } from 'react'

export default function TextInput({
    label,
    labelDisabled,
    ...props
}: {
    label: string
    labelDisabled?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="mb-5">
            {!labelDisabled && (
                <label htmlFor={props.name} className="block mb-5">
                    {label}:
                </label>
            )}
            <input {...props} className="input w-full" />
        </div>
    )
}
