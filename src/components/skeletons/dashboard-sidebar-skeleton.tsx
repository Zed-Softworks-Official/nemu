export default function DashboardSidebarSkeleton() {
    return (
        <>
            <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-xl"></div>
            </nav>
            <nav className="mt-auto flex flex-col items-center gap-4 px-2 sm:py-5">
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="skeleton h-10 w-10 rounded-full"></div>
            </nav>
        </>
    )
}
