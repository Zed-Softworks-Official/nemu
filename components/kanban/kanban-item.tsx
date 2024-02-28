'use client'

import { KanbanItem } from '@/core/structures'

export default function KanbanItemComponent({ item_data }: { item_data: KanbanItem }) {
    return (
        <div className="card shadow-xl bg-base-100">
            <div className="card-body">
                <p>{item_data.content}</p>
            </div>
        </div>
    )
}
