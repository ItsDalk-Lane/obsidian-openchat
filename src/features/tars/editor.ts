export interface RequestController {
	getController: () => AbortController
	cleanup: () => void
}
