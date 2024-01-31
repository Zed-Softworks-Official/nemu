export default function SocialsSkeleton() {
    return (
        <div>
            <div className="divider card-title">Socials</div>
            <div className="flex gap-5 justify-center items-center">
                <div className="skeleton bg-base-200 w-10 h-10 rounded-full"></div>
                <div className="skeleton bg-base-200 w-10 h-10 rounded-full"></div>
                <div className="skeleton bg-base-200 w-10 h-10 rounded-full"></div>
            </div>
        </div>
    )
}
