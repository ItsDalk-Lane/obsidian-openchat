import { X, FileText, Folder, Zap, Highlighter } from 'lucide-react';
import { localInstance } from 'src/i18n/locals';
import type { SelectedFile, SelectedFolder } from 'src/core/chat/types/chat';
import { ModelTag } from './ModelTag';
import { availableVendors } from 'src/settings/ai-runtime';
import { getProviderModelDisplayName } from 'src/utils/aiProviderMetadata';

// ---- InfoTags ----

interface ChatInputInfoTagsProps {
        selectedPromptTemplate: { name: string } | null | undefined;
        selectedText: string | null | undefined;
        onClearTemplate: () => void;
        onClearSelectedText: () => void;
}

export const ChatInputInfoTags = ({
        selectedPromptTemplate,
        selectedText,
        onClearTemplate,
        onClearSelectedText,
}: ChatInputInfoTagsProps) => (
        <>
                {selectedPromptTemplate && (
                        <div className="selected-template tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-bg-purple-100 tw-text-purple-700 tw-rounded tw-text-xs tw-mb-2">
                                <Zap className="tw-size-3 tw-flex-shrink-0" />
                                <span className="tw-max-w-40 tw-truncate" title={selectedPromptTemplate.name}>
                                        {localInstance.template_label}: {selectedPromptTemplate.name}
                                </span>
                                <button
                                        type="button"
                                        className="tw-ml-1 tw-p-0 tw-text-purple-700 hover:tw-text-purple-900 tw-cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); onClearTemplate(); }}
                                        title={localInstance.clear_template}
                                >
                                        <X className="tw-size-4" />
                                </button>
                        </div>
                )}
                {selectedText && (
                        <div className="selected-text tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-bg-orange-100 tw-text-orange-700 tw-rounded tw-text-xs tw-mb-2">
                                <Highlighter className="tw-size-3 tw-flex-shrink-0" />
                                <span className="tw-max-w-60 tw-truncate" title={selectedText}>
                                        {selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText}
                                </span>
                                <button
                                        type="button"
                                        className="tw-ml-1 tw-p-0 tw-text-orange-700 hover:tw-text-orange-900 tw-cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); onClearSelectedText(); }}
                                        title={localInstance.clear_selected_text}
                                >
                                        <X className="tw-size-4" />
                                </button>
                        </div>
                )}
        </>
);

// ---- ImagePreview ----

interface ChatInputImagePreviewProps {
        images: string[];
        onRemoveImage: (image: string) => void;
}

export const ChatInputImagePreview = ({ images, onRemoveImage }: ChatInputImagePreviewProps) => {
        if (images.length === 0) return null;
        return (
                <div className="selected-images tw-flex tw-flex-wrap tw-gap-2 tw-mb-2">
                        {images.map((image, index) => (
                                <div key={image} className="image-preview-container tw-relative">
                                        <img
                                                src={image}
                                                alt={`selected-${index}`}
                                                className="selected-image-preview tw-w-16 tw-h-16 tw-object-cover tw-rounded tw-border tw-border-gray-300"
                                        />
                                        <button
                                                type="button"
                                                className="remove-image-button tw-absolute tw-top-0 tw-right-0 tw-bg-red-500 tw-text-white tw-rounded-full tw-w-4 tw-h-4 tw-flex tw-items-center tw-justify-center tw-text-xs tw-cursor-pointer hover:tw-bg-red-600"
                                                onClick={() => onRemoveImage(image)}
                                        >
                                                <X className="tw-size-3" />
                                        </button>
                                </div>
                        ))}
                </div>
        );
};

// ---- FileTags ----

interface ChatInputFileTagsProps {
        selectedFiles: SelectedFile[];
        selectedFolders: SelectedFolder[];
        onRemoveFile: (id: string) => void;
        onRemoveFolder: (id: string) => void;
}

export const ChatInputFileTags = ({
        selectedFiles,
        selectedFolders,
        onRemoveFile,
        onRemoveFolder,
}: ChatInputFileTagsProps) => {
        if (selectedFiles.length === 0 && selectedFolders.length === 0) return null;
        return (
                <div className="selected-files tw-flex tw-flex-wrap tw-gap-2 tw-mb-2">
                        {selectedFiles.map((file) => (
                                <div
                                        key={file.id}
                                        className={`file-tag tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-rounded tw-text-xs tw-relative group ${
                                                file.isAutoAdded ? 'tw-bg-green-100 tw-text-green-700' : 'tw-bg-gray-100 tw-text-gray-700'
                                        }`}
                                >
                                        <FileText className="tw-size-3 tw-flex-shrink-0" />
                                        <span className="tw-max-w-40 tw-truncate" title={file.path}>
                                                {file.name}
                                                {file.isAutoAdded && <span className="ml-1 tw-px-1 tw-bg-green-600 tw-text-white tw-rounded tw-text-[10px]">活跃</span>}
                                                {file.extension === 'pdf' && <span className="ml-1 tw-px-1 tw-bg-blue-500 tw-text-white tw-rounded tw-text-[10px]">pdf</span>}
                                                {file.extension === 'canvas' && <span className="ml-1 tw-px-1 tw-bg-green-500 tw-text-white tw-rounded tw-text-[10px]">canvas</span>}
                                        </span>
                                        <button
                                                type="button"
                                                className="tw-ml-1 tw-p-0 tw-text-muted hover:tw-text-foreground tw-cursor-pointer"
                                                onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                                                title={localInstance.delete_file}
                                        >
                                                <X className="tw-size-4" />
                                        </button>
                                </div>
                        ))}
                        {selectedFolders.map((folder) => (
                                <div key={folder.id} className="folder-tag tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-bg-blue-100 tw-text-blue-700 tw-rounded tw-text-xs tw-relative group">
                                        <Folder className="tw-size-3 tw-flex-shrink-0" />
                                        <span className="tw-max-w-40 tw-truncate" title={folder.path}>{folder.name || folder.path}</span>
                                        <button
                                                type="button"
                                                className="tw-ml-1 tw-p-0 tw-text-muted hover:tw-text-foreground tw-cursor-pointer"
                                                onClick={(e) => { e.stopPropagation(); onRemoveFolder(folder.id); }}
                                                title={localInstance.delete_folder}
                                        >
                                                <X className="tw-size-4" />
                                        </button>
                                </div>
                        ))}
                </div>
        );
};

// ---- SelectedModelsHint ----

interface ProviderForHint {
        tag: string;
        vendor: string;
        options?: {
                parameters?: Record<string, unknown>;
        };
}

interface ChatInputSelectedModelsHintProps {
        multiModelMode: string;
        selectedModels: string[];
        providers: ProviderForHint[];
        onRemoveModel: (tag: string) => void;
}

export const ChatInputSelectedModelsHint = ({
        multiModelMode,
        selectedModels,
        providers,
        onRemoveModel,
}: ChatInputSelectedModelsHintProps) => {
        if (multiModelMode !== 'compare') return null;

        if (selectedModels.length > 0) {
                return (
                        <div className="tw-flex tw-flex-wrap tw-gap-1 tw-mb-1">
                                {selectedModels.map((tag) => {
                                        const p = providers.find((prov) => prov.tag === tag);
                                        const vendorName = p ? availableVendors.find((v) => v.name === p.vendor)?.name : undefined;
                                                                                                                                                const displayName = p ? getProviderModelDisplayName(p, providers) : tag;
                                        return (
                                                <ModelTag
                                                        key={tag}
                                                        modelTag={tag}
                                                                                                                modelName={displayName}
                                                        vendor={vendorName}
                                                        size="sm"
                                                        onClick={() => onRemoveModel(tag)}
                                                />
                                        );
                                })}
                        </div>
                );
        }

        return (
                <div className="tw-text-xs tw-text-muted tw-mb-1">
                        {localInstance.no_models_selected || '请至少选择一个模型'}
                </div>
        );
};
