export default function Masonry({ children }: { children: React.ReactNode }) {
    return (
        <div className="columns-1 gap-5 lg:gap-8 sm:columns-2 lg:columns-3 xl:columns-4 [&>img:not(:first-child)]:mt-5 lg:[&>img:not(:first-child)]:mt-8">
            {children}
        </div>
    )
}
