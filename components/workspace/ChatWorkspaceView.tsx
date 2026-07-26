"use client";

import { ChatWindow } from "../ChatWindow";
import type { Run, Task } from "@/lib/kernel";

type Props = React.ComponentProps<typeof ChatWindow> & {
  task?: Task | null;
  run?: Run | null;
};

export function ChatWorkspaceView({ task, run, ...chatProps }: Props) {
  return <ChatWindow task={task ?? null} run={run ?? null} {...chatProps} />;
}
