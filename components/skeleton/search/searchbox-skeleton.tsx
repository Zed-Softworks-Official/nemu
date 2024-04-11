import { ChevronRightIcon } from "lucide-react";

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
