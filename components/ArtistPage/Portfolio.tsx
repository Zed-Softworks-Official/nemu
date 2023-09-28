import React from "react";

import { PortfolioItem } from "@/helpers/data-inerfaces";

export default async function Portfolio({ handle, id }: { handle: string, id: string }) {
    let res = await fetch(`/api/artist/items/${handle}/portfolio/${id}`);
    let data = await res.json();

    return (
    <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4">
        {data.portfolio_items.map( (item: PortfolioItem) => {
        return (
            <div className="w-fit h-fit m-5">
                <img src={item.signed_url} alt={item.name} className="rounded-3xl w-full" />
            </div>
        )
        })}
    </div>)
}