import NavigationButtons from "./NavigationButtons";

export default function VertificationStep( { children, back, next, home }: { children: React.ReactNode, back: string, next: string, home?: boolean }) {

    return (
        <div className='flex flex-col justify-between min-w-[500px] min-h-[200px]'>
            {children}
            <NavigationButtons back={back} next={next} home={home} />
        </div>
    ) 
}
