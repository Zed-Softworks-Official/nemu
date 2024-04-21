export default function RatingView({ rating }: { rating: number }) {
    return (
        <div className="rating">
            <input
                type="radio"
                name="rating-2"
                className="mask mask-star-2 bg-orange-400 cursor-default"
                checked={rating === 1}
                disabled
            />
            <input
                type="radio"
                name="rating-2"
                className="mask mask-star-2 bg-orange-400 cursor-default"
                checked={rating === 2}
                disabled
            />
            <input
                type="radio"
                name="rating-2"
                className="mask mask-star-2 bg-orange-400 cursor-default"
                checked={rating === 3}
                disabled
            />
            <input
                type="radio"
                name="rating-2"
                className="mask mask-star-2 bg-orange-400 cursor-default"
                checked={rating === 4}
                disabled
            />
            <input
                type="radio"
                name="rating-2"
                className="mask mask-star-2 bg-orange-400 cursor-default"
                checked={rating === 5}
                disabled
            />
        </div>
    )
}
