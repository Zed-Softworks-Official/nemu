import { cn } from '@/lib/utils'

export default function Card({
    body,
    figure,
    classNames
}: {
    body: React.ReactNode
    classNames?: string
    figure?: React.ReactNode
}) {
    return (
        <div className={cn('card bg-base-300 shadow-xl', classNames)}>
            {figure && <figure>{figure}</figure>}
            <div className="card-body">{body}</div>
        </div>
    )
}
