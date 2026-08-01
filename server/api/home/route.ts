import { NextResponse } from "@/server/next-compat";
import { homedir } from "os";

export async function GET() {
  return NextResponse.json({ home: homedir() });
}
