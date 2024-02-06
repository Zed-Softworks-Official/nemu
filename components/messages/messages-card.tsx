import { ClassNames } from '@/core/helpers'

export default function MessagesCard({
    username,
    selected
}: {
    username: string
    selected?: boolean
}) {
    return (
        <div
            className={ClassNames(
                'card rounded-xl w-full',
                selected ? 'bg-primary' : 'bg-base-100'
            )}
        >
            <div className="card-body">
                <h1 className="card-title">{username}</h1>
            </div>
        </div>
    )
}
