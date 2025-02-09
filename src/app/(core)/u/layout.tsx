export default function UserLayout(props: { children: React.ReactNode }) {
    return (
        <div className="container mx-auto flex h-screen w-full items-center justify-center px-4">
            {props.children}
        </div>
    )
}
