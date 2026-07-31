import { NextResponse } from "next/server";
import { pickDirectoryViaSystemDialog } from "@/lib/system-directory-picker";
import { allowFileRoot } from "@/lib/file-access";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const selected = await pickDirectoryViaSystemDialog();
    if (!selected) {
      return NextResponse.json({ cancelled: true, cwd: null });
    }

    allowFileRoot(selected);
    return NextResponse.json({ cancelled: false, cwd: selected });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
