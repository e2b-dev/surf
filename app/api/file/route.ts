import { Sandbox } from "@e2b/desktop";
import { SANDBOX_TIMEOUT_MS } from "@/lib/config";
import { NextResponse, NextRequest } from "next/server";


export async function POST(request: Request) {
    const formData = await request.formData();

    const file = formData.get("file");
    if (!file) {
        return NextResponse.json({ error: "No files received." }, { status: 400 });
    }

    const path = formData.get("path");
    if (!path) {
        return NextResponse.json({ error: "No path received." }, { status: 400 });
    }

    const sandboxId = formData.get("sandboxId");
    if (!sandboxId) {
        return NextResponse.json({ error: "No sandboxId received." }, { status: 400 });
    }

    const apiKey = process.env.E2B_API_KEY;

    if (!apiKey) {
        return new Response("E2B API key not found", { status: 500 });
    }


    let desktop: Sandbox | undefined;
    desktop = await Sandbox.connect(sandboxId.toString());
    desktop.setTimeout(SANDBOX_TIMEOUT_MS);


    try {
        await desktop.files.write([{ path: path.toString(), data: file.toString() }])
        return NextResponse.json({ Message: "Success", status: 201 });
    } catch (error) {
        console.log("Error occured ", error);
        return NextResponse.json({ Message: "Failed", status: 500 });
    }

}
// const content = await sbx.files.read(path)

export async function GET(request: NextRequest) {

    const sandboxId = request.nextUrl.searchParams.get("sandboxId");
    if (!sandboxId) {
        return NextResponse.json({ error: "No sandboxId received." }, { status: 400 });
    }
    const path = request.nextUrl.searchParams.get("path");
    if (!path) {
        return NextResponse.json({ error: "No path received." }, { status: 400 });
    }

    let desktop: Sandbox | undefined;
    desktop = await Sandbox.connect(sandboxId);
    desktop.setTimeout(SANDBOX_TIMEOUT_MS);
    const content = await desktop.files.read(path);
    return NextResponse.json({ content });
}
