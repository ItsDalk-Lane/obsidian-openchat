import { ApiResponse } from "@/server/http";
import { pickDirectoryViaSystemDialog } from "@/lib/system-directory-picker";
import { allowFileRoot } from "@/lib/file-access";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const selected = await pickDirectoryViaSystemDialog();
    if (!selected) {
      return ApiResponse.json({ cancelled: true, cwd: null });
    }

    allowFileRoot(selected);
    return ApiResponse.json({ cancelled: false, cwd: selected });
  } catch (error) {
    return ApiResponse.json({ error: String(error) }, { status: 500 });
  }
}
