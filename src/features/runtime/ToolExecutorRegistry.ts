import type { ToolExecutor } from '../tars/agent-loop/types';

export class ToolExecutorRegistry {
	private readonly executors: ToolExecutor[] = [];

	register(executor: ToolExecutor): () => void {
		this.executors.push(executor);
		return () => {
			const index = this.executors.indexOf(executor);
			if (index >= 0) {
				this.executors.splice(index, 1);
			}
		};
	}

	getAll(): ToolExecutor[] {
		return [...this.executors];
	}

	clear(): void {
		this.executors.length = 0;
	}
}