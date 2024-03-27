import { ChevronRightIcon } from '@heroicons/react/20/solid'

export default function SearchboxSkeleton() {
    return (
        <>
            <div className="flex items-center justify-between w-full">
                <div className="skeleton bg-base-300 w-[90%] h-12"></div>
                <ChevronRightIcon className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between w-full">
                <div className="skeleton bg-base-300 w-[90%] h-12"></div>
                <ChevronRightIcon className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between w-full">
                <div className="skeleton bg-base-300 w-[90%] h-12"></div>
                <ChevronRightIcon className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between w-full">
                <div className="skeleton bg-base-300 w-[90%] h-12"></div>
                <ChevronRightIcon className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between w-full">
                <div className="skeleton bg-base-300 w-[90%] h-12"></div>
                <ChevronRightIcon className="w-6 h-6" />
            </div>
        </>
    )
}
