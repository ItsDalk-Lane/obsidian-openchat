import {
	Bot,
	FileInput,
	FileText,
	Folder,
	ImageUp,
	Paperclip,
	Zap,
} from 'lucide-react';
import type { ChatInputSelectorItem } from './chatInputSelectorUtils';

export const renderChatInputSelectorIcon = (
	item: ChatInputSelectorItem,
): React.ReactNode => {
	switch (item.kind) {
		case 'skill':
			return <Zap className="tw-size-4" />;
		case 'agent':
			return <Bot className="tw-size-4" />;
		case 'action-template':
		case 'prompt-template':
			return <Zap className="tw-size-4" />;
		case 'action-upload-file':
			return <Paperclip className="tw-size-4" />;
		case 'action-upload-image':
			return <ImageUp className="tw-size-4" />;
		case 'vault-folder':
			return <Folder className="tw-size-4" />;
		case 'vault-file':
			return <FileText className="tw-size-4" />;
		case 'active-file':
			return <FileInput className="tw-size-4" />;
		default:
			return null;
	}
};