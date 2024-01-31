import Footer from "@/components/footer";
import Logo from "@/components/navigation/standard/logo";

export default function Layout({ children }: { children: React.ReactNode}) {
    return (
        <div className="bg-[url('/bg.jpg')] bg-cover h-screen">
            <div className="flex flex-1 flex-wrap justify-center items-center h-screen">
                <div className="bg-base-300/60 p-10 rounded-xl backdrop-blur-3xl flex flex-col gap-5">
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