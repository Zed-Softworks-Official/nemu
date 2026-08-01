export default function SetupLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <main className="flex min-h-svh items-center justify-center bg-background p-6">
            <div className="w-full max-w-lg">{children}</div>
        </main>
    )
}
