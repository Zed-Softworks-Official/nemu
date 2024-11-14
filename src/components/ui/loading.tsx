import NemuImage from '~/components/nemu-image'

export default function Loading() {
    return (
        <div>
            <div className="flex h-full w-full flex-col items-center justify-center">
                <NemuImage
                    src={'/loading.gif'}
                    alt="Loading..."
                    width={200}
                    height={200}
                    priority
                    unoptimized
                />
            </div>
        </div>
    )
}
