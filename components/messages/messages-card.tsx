import classNames from '@/helpers/classnames'

export default function MessagesCard({
    username,
    selected
}: {
    username: string
    selected?: boolean
}) {
    return (
        <div
            className={classNames(
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
