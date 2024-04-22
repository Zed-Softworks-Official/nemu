import NemuImage from '~/components/nemu-image'

export default function Loading() {
    return (
        <div>
            <div className="flex flex-col w-full h-full justify-center items-center">
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
