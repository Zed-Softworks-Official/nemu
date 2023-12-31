import { InputHTMLAttributes } from 'react'

export default function TextArea({
    label,
    ...props
}: { label: string } & InputHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <div className="mb-5">
            <label htmlFor={props.name} className="block mb-5">
                {label}:
            </label>
            <textarea {...props} className="textarea resize-none w-full h-80"></textarea>
        </div>
    )
}
