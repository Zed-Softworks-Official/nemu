import Link from 'next/link'
import { XCircleIcon } from '@heroicons/react/20/solid'

export default function FormSubmitButtons({
    cancel_url,
    submit_text,
    button_icon,
    disabled
}: {
    cancel_url: string
    submit_text: React.ReactNode
    button_icon: React.ReactNode
    disabled: boolean
}) {
    return (
        <div className="grid grid-cols-2 gap-5">
            <Link href={cancel_url} className="btn btn-outline">
                <XCircleIcon className="w-6 h-6" />
                Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={disabled}>
                {button_icon}
                {submit_text}
            </button>
        </div>
    )
}
