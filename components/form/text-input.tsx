import { InputHTMLAttributes } from 'react'

export default function TextInput({
    label,
    ...props
}: {
    label: string
} & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="mb-5">
            <label htmlFor={props.name} className="block mb-5">
                {label}:
            </label>
            <input {...props} className="input w-full" />
        </div>
    )
}
