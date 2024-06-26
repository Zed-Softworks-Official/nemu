export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen w-screen flex-row items-center justify-center bg-[url(/curved0.jpg)] bg-cover bg-no-repeat">
            {children}
        </div>
    )
}
