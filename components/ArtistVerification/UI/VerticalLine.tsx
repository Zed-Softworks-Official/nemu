export default function VerticalLine( { active }: { active: boolean }) {
    return (
        <div className={`w-[4px] h-[30px] ml-2 rounded ${active ? "bg-gradient-to-r from-primarylight to-azure" : "bg-primary opacity-25"}`}>
        </div>
    )
}