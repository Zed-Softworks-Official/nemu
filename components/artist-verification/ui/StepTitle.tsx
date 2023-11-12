
export default function StepTitle( { active, title }: { active: boolean, title: string}) {
    return (
        <h2 className={`text-xl ${active ? 'text-transparent bg-clip-text' : 'text-white/30'}` }>{title}</h2>
    )
}