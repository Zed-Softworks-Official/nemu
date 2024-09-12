import { PlusCircleIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from './button'

export default function EmptyState(props: {
    create_url: string
    icon: React.ReactNode
    heading: string
    description: string
    button_text: string
    disabled?: boolean
}) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-10">
            <div className="flex flex-col items-center justify-center gap-2">
                {props.icon}
                <h2 className="text-lg font-bold">{props.heading}</h2>
                <span className="text-md text-base-content/60">{props.description}</span>
                <EmptyStateCreateButton
                    create_url={props.create_url}
                    button_text={props.button_text}
                    disabled={!props.disabled}
                />
            </div>
        </div>
    )
}

function EmptyStateCreateButton(props: {
    create_url: string
    button_text: string
    disabled?: boolean
}) {
    if (props.disabled) {
        return (
            <Button disabled={props.disabled} variant={'default'}>
                <PlusCircleIcon className="h-6 w-6" />
                {props.button_text}
            </Button>
        )
    }

    return (
        <Link href={props.create_url} className="btn btn-primary text-white">
            <PlusCircleIcon className="h-6 w-6" />
            {props.button_text}
        </Link>
    )
}
