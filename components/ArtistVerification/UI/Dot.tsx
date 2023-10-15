
export default function Dot({ active }: { active: boolean }) {
    return(
        <div className={`w-[20px] h-[20px] rounded-full ${active ? "bg-gradient-to-r from-primarylight to-azure" : "bg-primary opacity-25 hover:opacity-40"}`}>
        </div>
    )
}