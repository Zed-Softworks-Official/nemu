import Footer from "@/components/Footer";

export default function Layout({ children }: { children: React.ReactNode}) {
    return (
        <div className="bg-[url('/bg.jpg')] bg-cover h-screen">
            <div className="flex flex-1 flex-wrap justify-center items-center h-screen">
                <div className="dark:bg-charcoal/60 bg-white/60 p-10 rounded-3xl backdrop-blur-3xl">
                    <div className="text-center">
                        <h1>Nemu</h1>
                        <hr className="seperation" />
                    </div>
                    
                    { children }

                    <Footer />
                </div>
            </div>
        </div>
    )
}