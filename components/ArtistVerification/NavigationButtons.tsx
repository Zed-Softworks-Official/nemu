import Link from "next/link";

export default function NavigationButtons({ back, next, home, end }: { back: string, next: string, home?: boolean, end?: boolean }) {
    return (
        <div className="flex justify-center gap-80">
            { 
                home ? 
                '' : 
                <Link href={back}>
                    <p className="p-5 border-2 rounded-xl bg-clip-text text-transparent text-xl font-bold bg-gradient-to-r from-primarylight to-azure">Back</p>
                </Link> 
            }

            {
                end ?
                <button type="submit" className="p-5 rounded-xl text-xl font-bold bg-gradient-to-r from-primarylight to-azure">
                    Submit
                </button> :
                <Link href={next}>
                    <p className="p-5 rounded-xl text-xl font-bold bg-gradient-to-r from-primarylight to-azure">Next</p>
                </Link>
            }
            
        </div>
    )
}