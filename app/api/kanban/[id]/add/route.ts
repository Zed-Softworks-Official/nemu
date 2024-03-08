import { NemuResponse, StatusCode } from '@/core/responses'
import { KanbanTask } from '@/core/structures'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'


/**
 * 
 * @param id - kanban id 
 * @returns 
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const data = (await req.json()) as { new_task: KanbanTask }

    // Get Kanban
    const kanban = await prisma.kanban.findFirst({
        where: {
            id: params.id
        }
    })

    // Add the task to the database
    await prisma.kanban.update({
        where: {
            id: params.id
        },
        data: {
            tasks: JSON.stringify([...JSON.parse(kanban?.tasks!), data.new_task])
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
