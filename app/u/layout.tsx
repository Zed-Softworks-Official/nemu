import Footer from "@/components/footer";
import Logo from "@/components/navigation/standard/logo";

export default function Layout({ children }: { children: React.ReactNode}) {
    return (
        <div className="bg-[url('/bg.jpg')] bg-cover h-screen">
            <div className="flex flex-1 flex-wrap justify-center items-center h-screen">
                <div className="dark:bg-charcoal/60 bg-white/60 p-10 rounded-3xl backdrop-blur-3xl">
                    <div className="text-center">
                        <Logo />
                        <hr className="seperation" />
                    </div>
                    
                    { children }

                    <Footer />
                </div>
            </div>
        </div>
    )
}