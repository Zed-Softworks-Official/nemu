export default function UserLayout(props: { children: React.ReactNode }) {
    return (
        <div className="container mx-auto flex min-h-full w-full flex-1 flex-col items-center justify-center px-4">
            {props.children}
        </div>
    )
}
