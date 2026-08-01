import { ApiResponse } from "@/server/http";
import { homedir } from "os";

export async function GET() {
  return ApiResponse.json({ home: homedir() });
}
