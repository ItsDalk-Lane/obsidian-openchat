export interface SlashCommandCandidate {
  name: string;
  description?: string | null;
}

export function slashMatchRank(command: SlashCommandCandidate, query: string): number {
  const name = command.name.toLowerCase();
  const description = command.description?.toLowerCase() ?? "";
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (description.includes(query)) return 3;
  return 4;
}
