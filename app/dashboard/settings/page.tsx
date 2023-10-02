
export default function Settings() {
    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="grid grid-cols-12 gap-10">
                <div className="dark:bg-fullblack bg-fullwhite p-10 rounded-3xl col-span-3">
                    <div className="pb-10">
                        <h1 className="font-bold text-2xl text-center">Settings</h1>
                        <hr className="seperation" />
                    </div>
                </div>
                <div className="dark:bg-fullblack bg-fullwhite p-10 rounded-3xl col-span-9">
                    <div className="pb-10">
                        <h1 className="font-bold text-2xl text-center">About</h1>
                        <hr className="seperation" />
                    </div>
                </div>
            </div>
        </main>
    )
}