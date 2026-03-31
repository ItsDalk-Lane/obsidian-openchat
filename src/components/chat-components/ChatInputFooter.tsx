import { CornerDownLeft, Palette, RotateCw, StopCircle } from 'lucide-react';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { ChatState } from 'src/domains/chat/types';
import { localInstance } from 'src/i18n/locals';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { ModelSelector } from './ModelSelector';

interface MultiModelProgress {
	total: number;
	completed: number;
	errors: number;
	generating: number;
}

interface ChatInputFooterProps {
	service: ChatService;
	state: ChatState;
	isMultiModel: boolean;
	providers: ReturnType<ChatService['getProviders']>;
	submitActionLabel: string;
	multiModelProgress: MultiModelProgress | null;
	isImageGenerationIntent: boolean;
	onSubmit: () => void;
}

export const ChatInputFooter = ({
	service,
	state,
	isMultiModel,
	providers,
	submitActionLabel,
	multiModelProgress,
	isImageGenerationIntent,
	onSubmit,
}: ChatInputFooterProps) => {
	const renderInputAction = () => {
		if (!state.isGenerating) {
			return (
				<span
					onClick={(event) => {
						event.preventDefault();
						onSubmit();
					}}
					className="tw-cursor-pointer tw-text-muted hover:tw-text-accent tw-flex tw-items-center"
					aria-label={submitActionLabel}
					title={submitActionLabel}
				>
					<CornerDownLeft className="tw-size-4" />
				</span>
			);
		}

		if (isMultiModel && multiModelProgress) {
			return (
				<div className="multi-model-stop-bar tw-flex tw-items-center tw-gap-2">
					{multiModelProgress.generating > 0 && (
						<span className="tw-text-xs tw-text-muted">
							{localInstance.generating_progress
								.replace('{completed}', String(multiModelProgress.completed + multiModelProgress.errors))
								.replace('{total}', String(multiModelProgress.total))}
						</span>
					)}
					<span
						onClick={() => service.stopAllGeneration()}
						className="tw-cursor-pointer tw-text-muted hover:tw-text-accent tw-flex tw-items-center"
						aria-label={localInstance.stop_all}
						title={localInstance.stop_all}
					>
						<StopCircle className="tw-size-4" />
					</span>
					{multiModelProgress.errors > 0 && (
						<span
							onClick={() => service.retryAllFailed()}
							className="tw-cursor-pointer tw-flex tw-items-center"
							style={{ color: 'var(--text-error, #dc2626)' }}
							aria-label={localInstance.retry_failed}
							title={localInstance.retry_failed}
						>
							<RotateCw style={{ width: 14, height: 14 }} />
							<span className="tw-ml-1 tw-text-xs">
								{localInstance.retry_failed}({multiModelProgress.errors})
							</span>
						</span>
					)}
				</div>
			);
		}

		return (
			<span
				onClick={() => service.stopGeneration()}
				className="tw-cursor-pointer tw-text-muted hover:tw-text-accent tw-flex tw-items-center"
				aria-label={localInstance.chat_stop_button_label}
				title={localInstance.chat_stop_button_label}
			>
				<StopCircle className="tw-size-4" />
			</span>
		);
	};

	return (
		<div className="tw-flex tw-items-center tw-justify-between tw-mt-0">
			<div className="tw-flex tw-items-center tw-gap-2" style={{ flex: 1, minWidth: 0 }}>
				<ModelSelector
					providers={providers}
					value={state.selectedModelId ?? ''}
					onChange={(modelId) => service.setModel(modelId)}
					selectedModels={state.selectedModels}
					onModelToggle={(tag) => {
						if (state.selectedModels.includes(tag)) {
							service.removeSelectedModel(tag);
							return;
						}

						service.addSelectedModel(tag);
					}}
					multiModelMode={state.multiModelMode}
					onModeChange={(mode) => service.setMultiModelMode(mode)}
				/>
				<ContextUsageIndicator
					providers={providers}
					selectedModelId={state.selectedModelId ?? null}
					session={state.activeSession}
					isGenerating={state.isGenerating}
					size="sm"
				/>
			</div>
			<div className="tw-flex tw-items-center tw-gap-2">
				{renderInputAction()}
				{state.isGenerating && isImageGenerationIntent && (
					<div className="tw-flex tw-items-center tw-gap-1 tw-ml-2 tw-px-2 tw-py-1 tw-bg-purple-100 tw-text-purple-700 tw-rounded tw-text-xs">
						<Palette className="tw-size-3" />
						<span>{localInstance.image_generation_mode}</span>
					</div>
				)}
			</div>
		</div>
	);
};