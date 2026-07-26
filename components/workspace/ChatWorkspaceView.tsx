"use client";

import { ChatWindow } from "../ChatWindow";
import type { Run, Task } from "@/lib/kernel";

type Props = React.ComponentProps<typeof ChatWindow> & {
  task?: Task | null;
  run?: Run | null;
};

export function ChatWorkspaceView({ task, run, ...chatProps }: Props) {
  void task;
  void run;
  return <ChatWindow {...chatProps} />;
}
