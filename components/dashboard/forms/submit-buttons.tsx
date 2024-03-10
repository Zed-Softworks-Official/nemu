import Link from 'next/link'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'

export default function FormSubmitButtons({ cancel_url, submit_text }: { cancel_url: string; submit_text: React.ReactNode }) {
    return (
        <div className="grid grid-cols-2 gap-5">
            <Link href={cancel_url} className="btn btn-outline">
                <XCircleIcon className="w-6 h-6" />
                Cancel
            </Link>
            <button type="submit" className="btn btn-primary">
                <CheckCircleIcon className="w-6 h-6" />
                {submit_text}
            </button>
        </div>
    )
}
