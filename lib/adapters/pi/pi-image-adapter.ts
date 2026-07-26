import { validateAgentImages } from "../../image-attachments";

export interface AgentImageInput {
  type: "image";
  data: string;
  mimeType: string;
}

export function parseAgentImages(value: unknown, commandType: "prompt" | "steer" | "follow_up"): AgentImageInput[] | undefined {
  const validationError = validateAgentImages(value);
  if (validationError) {
    throw new Error(`Invalid ${commandType} images: ${validationError}`);
  }
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value as AgentImageInput[];
}
