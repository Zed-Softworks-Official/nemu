import Link from 'next/link'
import ArtistSubmitButton from './artist-submit-button'

export default function NavigationButtons({
    back,
    next,
    home,
    end
}: {
    back: string
    next: string
    home?: boolean
    end?: boolean
}) {
    return (
        <div className="flex justify-center gap-80">
            {home ? (
                ''
            ) : (
                <Link href={back}>
                    <p className="btn btn-accent btn-outline">
                        Back
                    </p>
                </Link>
            )}

            {end ? (
                <ArtistSubmitButton />
            ) : (
                <Link href={next}>
                    <p className="btn btn-primary">
                        Next
                    </p>
                </Link>
            )}
        </div>
    )
}
