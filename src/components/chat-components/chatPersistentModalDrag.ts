/**
 * 持久化模态框拖动功能
 * 使用闭包管理拖动状态，避免将拖动状态暴露为类字段
 */

/**
 * 为模态框设置拖动功能，并在标题栏添加最小化和关闭按钮
 * @returns 清理函数，调用时移除所有拖动事件监听器
 */
export function setupModalDragging(
	modalEl: HTMLElement,
	titleEl: HTMLElement,
	onMinimize: () => void,
	onClose: () => void
): () => void {
	// 拖动状态（闭包变量，无需挂载到类实例上）
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let modalStartLeft = 0;
	let modalStartTop = 0;
	let dragMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
	let dragMouseUpHandler: ((e: MouseEvent) => void) | null = null;

	// 设置标题栏光标样式
	titleEl.style.cursor = 'move';
	titleEl.style.userSelect = 'none';
	titleEl.style.position = 'relative'; // 确保按钮容器正确定位

	// 创建关闭按钮容器
	const closeBtnContainer = titleEl.createDiv('modal-close-button-container');

	// 创建缩小按钮
	const minimizeBtn = closeBtnContainer.createEl('button', {
		cls: 'chat-persistent-modal-minimize-btn',
		attr: { 'aria-label': '缩小' }
	});
	minimizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
	minimizeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onMinimize();
	});

	// 创建关闭按钮
	const closeBtn = closeBtnContainer.createEl('button', {
		cls: 'chat-persistent-modal-close-btn',
		attr: { 'aria-label': '关闭' }
	});
	closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onClose();
	});

	// 鼠标按下开始拖动
	const mousedownHandler = (e: MouseEvent) => {
		if (e.button !== 0) return; // 只响应左键

		// 检查点击是否在按钮容器内
		if ((e.target as HTMLElement).closest('.modal-close-button-container')) {
			return; // 不启动拖动
		}

		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;

		// 获取当前模态框位置
		const rect = modalEl.getBoundingClientRect();
		modalStartLeft = rect.left;
		modalStartTop = rect.top;

		// 创建鼠标移动和释放事件处理函数
		dragMouseMoveHandler = (moveEvent: MouseEvent) => {
			if (!isDragging) return;

			const deltaX = moveEvent.clientX - dragStartX;
			const deltaY = moveEvent.clientY - dragStartY;

			// 计算新位置
			const newLeft = modalStartLeft + deltaX;
			const newTop = modalStartTop + deltaY;

			// 应用新位置
			modalEl.style.position = 'fixed';
			modalEl.style.left = `${newLeft}px`;
			modalEl.style.top = `${newTop}px`;
			modalEl.style.transform = 'none';
			modalEl.style.margin = '0';
		};

		dragMouseUpHandler = () => {
			isDragging = false;
			if (dragMouseMoveHandler) {
				document.removeEventListener('mousemove', dragMouseMoveHandler);
				dragMouseMoveHandler = null;
			}
			if (dragMouseUpHandler) {
				document.removeEventListener('mouseup', dragMouseUpHandler);
				dragMouseUpHandler = null;
			}
		};

		// 添加全局事件监听器
		document.addEventListener('mousemove', dragMouseMoveHandler);
		document.addEventListener('mouseup', dragMouseUpHandler);

		// 阻止默认行为
		e.preventDefault();
	};

	titleEl.addEventListener('mousedown', mousedownHandler);

	// 返回清理函数
	return function cleanupDrag() {
		isDragging = false;
		if (dragMouseMoveHandler) {
			document.removeEventListener('mousemove', dragMouseMoveHandler);
			dragMouseMoveHandler = null;
		}
		if (dragMouseUpHandler) {
			document.removeEventListener('mouseup', dragMouseUpHandler);
			dragMouseUpHandler = null;
		}
	};
}
