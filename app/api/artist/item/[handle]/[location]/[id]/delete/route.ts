import { PrismaClient } from "@prisma/client";
import { S3Delete, StringToAWSLocationsEnum } from "@/helpers/s3";

//////////////////////////////////////
// Delete Object From S3
//////////////////////////////////////
export async function GET(req: Request, { params }: { params: { handle: string, location: string, id: string}}) {
    let prisma = new PrismaClient();
    let portfolio_item = await prisma.portfolio.findFirst({
        where: {
            image: params.id
        }
    });

    await prisma.portfolio.delete({
        where: {
            id: portfolio_item?.id
        }
    });

    return S3Delete(params.handle, StringToAWSLocationsEnum(params.location), params.id);
}