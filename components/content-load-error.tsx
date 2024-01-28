import NemuImage from './nemu-image'

export default function ContentLoadError() {
    return (
        <div className="flex flex-col justify-center items-center gap-5">
            <NemuImage
                src={'/nemu/not-like-this.png'}
                alt="Not like this"
                width={200}
                height={200}
                priority
            />
            <h2 className="card-title">Oh Nyo!</h2>
            <p className="text-base-content/80">Something went wrong!</p>
        </div>
    )
}
