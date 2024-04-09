import { cn } from '@/lib/utils'

export default function CommissionRequestContent({
    content,
    classNames
}: {
    content: string
    classNames?: string
}) {
    return (
        <>
            {content && (
                <div className='flex flex-col gap-2'>
                    {Object.keys(JSON.parse(content)).map((key, i) => (
                        <div
                            key={i}
                            className={cn('card bg-base-300 shadow-xl', classNames)}
                        >
                            <div className="card-body">
                                <h2 className="card-title">
                                    {JSON.parse(content)[key].label}
                                </h2>
                                <p>{JSON.parse(content)[key].value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}
