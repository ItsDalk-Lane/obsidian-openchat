import { type TemplateState } from './engine/FormTemplateProcessEngine';
import type { CreateFileOptions } from 'src/utils/createFileByText';
import { FileConflictResolution } from 'src/types/enums/FileConflictResolution';
import { OpenPageInType } from 'src/types/enums/OpenPageInType';

export type FileConflictStrategy =
    | "error"
    | "overwrite"
    | "rename"
    | "skip"
    | FileConflictResolution;

export type FolderDeleteMode = "recursive" | "files-only" | "folder-only";

export type OpenFileMode =
    | "none"
    | "modal"
    | "new-tab"
    | "current"
    | "split"
    | "new-window"
    | "tab"
    | "window";

export interface WriteFileOptions {
    path: string;
    content?: string;
    template?: string;
    variables?: Record<string, unknown>;
    state?: TemplateState;
    createFolders?: boolean;
    conflictStrategy?: FileConflictStrategy;
    confirmOverwrite?: boolean;
    silent?: boolean;
    createFileOptions?: CreateFileOptions;
}

export interface WriteFileResult {
    success: boolean;
    action: "create" | "overwrite" | "skipped";
    path: string;
    bytesWritten?: number;
    error?: string;
    actualPath?: string;
}

export interface DeleteFileOptions {
    paths: string | string[];
    folderMode?: FolderDeleteMode;
    deleteType?: "file" | "folder";
    silent?: boolean;
    state?: TemplateState;
    variables?: Record<string, unknown>;
}

export interface DeleteFileResult {
    success: boolean;
    deletedFiles: string[];
    deletedFolders: string[];
    skippedFiles: string[];
    errors: Array<{ path: string; error: string }>;
}

export interface MoveFileOptions {
    paths: string | string[];
    targetFolder: string;
    moveType?: "file" | "folder";
    conflictStrategy?: FileConflictStrategy;
    silent?: boolean;
    state?: TemplateState;
    variables?: Record<string, unknown>;
}

export interface MoveFileResult {
    success: boolean;
    moved: Array<{ from: string; to: string }>;
    skipped: Array<{ path: string; reason: string }>;
    errors: Array<{ path: string; error: string }>;
}

export interface OpenFileOptions {
    path: string;
    mode?: OpenFileMode | OpenPageInType;
    state?: TemplateState;
    variables?: Record<string, unknown>;
    silent?: boolean;
}

export interface OpenFileResult {
    success: boolean;
    path: string;
    mode: string;
    error?: string;
}
