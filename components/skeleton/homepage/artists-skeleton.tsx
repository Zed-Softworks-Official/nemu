export default function ArtistsSkeleton() {
    return (
        <div className="flex flex-col my-10 gap-4 w-full">
            <div className="skeleton h-4 w-1/4"></div>
            <div className="grid grid-cols-4 gap-5">
                <div className="skeleton w-64 h-64"></div>
                <div className="skeleton w-64 h-64"></div>
                <div className="skeleton w-64 h-64"></div>
                <div className="skeleton w-64 h-64"></div>
            </div>
        </div>
    )
}
