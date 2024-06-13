import NemuImage from '~/components/nemu-image'

export default function NotFound() {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-5">
            <NemuImage
                src={'/nemu/this-is-fine.png'}
                alt="404 Not Found"
                width={200}
                height={200}
            />
            <h1 className="text-3xl font-bold">404</h1>
            <p className="text-base-content/80">
                Oh nyo! The page you are looking for does not exist!
            </p>
        </div>
    )
}
