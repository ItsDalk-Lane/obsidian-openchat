import { App, normalizePath, TFile, TFolder } from "obsidian";
import { FormTemplateProcessEngine } from "./engine/FormTemplateProcessEngine";
import { createFileByText } from "src/utils/createFileByText";
import { FileConflictResolution } from "src/types/enums/FileConflictResolution";
import { Strings } from "src/utils/Strings";
import { openFilePathDirectly } from "src/utils/openFilePathDirectly";
import { PathResolverService } from "./PathResolverService";
import {
    resolveState,
    normalizeAndValidatePath,
    mapConflictStrategy,
    isConflictStrategy,
    normalizeOpenMode,
    buildMoveTargetPath,
    generateAvailablePath,
    ensureFolderExists,
    resolveContent,
} from "./fileOperationHelpers";

export type {
    FolderDeleteMode,
    OpenFileMode,
    WriteFileOptions,
    WriteFileResult,
    DeleteFileOptions,
    DeleteFileResult,
    MoveFileOptions,
    MoveFileResult,
    OpenFileOptions,
    OpenFileResult,
} from "./fileOperationTypes";
import type {
    WriteFileOptions,
    WriteFileResult,
    DeleteFileOptions,
    DeleteFileResult,
    MoveFileOptions,
    MoveFileResult,
    OpenFileOptions,
    OpenFileResult,
} from "./fileOperationTypes";

export class FileOperationService {
    constructor(private readonly app: App) {}

    async writeFile(options: WriteFileOptions): Promise<WriteFileResult> {
        try {
            const state = resolveState(options.state, options.variables);
            const engine = new FormTemplateProcessEngine();
            const rawPath = await engine.process(options.path ?? "", state, this.app);
            const filePath = normalizeAndValidatePath(rawPath);
            if (!filePath) {
                return {
                    success: false,
                    action: "skipped",
                    path: "",
                    error: "文件路径不能为空",
                };
            }

            const content = await resolveContent(this.app, options, engine, state);
            const normalized = normalizePath(filePath);
            const existing = this.app.vault.getAbstractFileByPath(normalized);
            const conflictStrategy = options.conflictStrategy ?? FileConflictResolution.OVERWRITE;

            if (isConflictStrategy(conflictStrategy, FileConflictResolution.SKIP) && existing) {
                return {
                    success: true,
                    action: "skipped",
                    path: normalized,
                };
            }

            if (isConflictStrategy(conflictStrategy, "error") && existing) {
                return {
                    success: false,
                    action: "skipped",
                    path: normalized,
                    error: "目标文件已存在",
                };
            }

            const createFileOptions = options.createFileOptions ?? {
                enableAutoTypeConversion: true,
                strictTypeChecking: false,
                logTypeConversions: process.env.NODE_ENV === "development",
            };

            const resolution = mapConflictStrategy(conflictStrategy);
            const file = await createFileByText(this.app, normalized, content, resolution, createFileOptions);
            const finalPath = file.path;
            const writeAction = existing ? "overwrite" : "create";
            const action = resolution === FileConflictResolution.SKIP && existing ? "skipped" : writeAction;

            return {
                success: true,
                action,
                path: normalized,
                actualPath: finalPath !== normalized ? finalPath : undefined,
                bytesWritten: content.length,
            };
        } catch (error) {
            return {
                success: false,
                action: "skipped",
                path: options.path ?? "",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async deleteFile(options: DeleteFileOptions): Promise<DeleteFileResult> {
        const result: DeleteFileResult = {
            success: true,
            deletedFiles: [],
            deletedFolders: [],
            skippedFiles: [],
            errors: [],
        };

        const state = resolveState(options.state, options.variables);
        const engine = new FormTemplateProcessEngine();
        const rawPaths = Array.isArray(options.paths) ? options.paths : [options.paths];
        const resolvedPaths: string[] = [];

        for (const raw of rawPaths) {
            if (Strings.isBlank(raw)) continue;
            const processed = await engine.process(String(raw), state, this.app);
            if (Strings.isBlank(processed)) continue;
            resolvedPaths.push(normalizePath(processed));
        }

        const uniquePaths = Array.from(new Set(resolvedPaths));
        if (uniquePaths.length === 0) {
            result.success = false;
            result.errors.push({ path: "", error: "未提供有效的删除路径" });
            return result;
        }

        const folderMode = options.folderMode ?? "recursive";
        for (const targetPath of uniquePaths) {
            // 使用模糊路由解析路径
            const resolver = new PathResolverService(this.app);
            const resolveResult = await resolver.resolvePath(targetPath, {
                allowFuzzyMatch: true
            });

            if (!resolveResult.success || (!resolveResult.file && !resolveResult.folder)) {
                result.success = false;
                result.errors.push({
                    path: targetPath,
                    error: resolveResult.error || "文件或文件夹不存在"
                });
                continue;
            }

            const existing = resolveResult.file || resolveResult.folder;
            if (!existing) {
                result.success = false;
                result.errors.push({ path: targetPath, error: "文件或文件夹不存在" });
                continue;
            }

            if (options.deleteType === "file" && !(existing instanceof TFile)) {
                result.success = false;
                result.errors.push({ path: targetPath, error: "目标不是文件" });
                continue;
            }

            if (options.deleteType === "folder" && !(existing instanceof TFolder)) {
                result.success = false;
                result.errors.push({ path: targetPath, error: "目标不是文件夹" });
                continue;
            }

            try {
                if (existing instanceof TFile) {
                    await this.app.vault.delete(existing);
                    result.deletedFiles.push(existing.path);
                    continue;
                }

                if (folderMode === "recursive") {
                    await this.app.vault.delete(existing, true);
                    result.deletedFolders.push(existing.path);
                    continue;
                }

                if (folderMode === "files-only") {
                    const files = existing.children.filter((child): child is TFile => child instanceof TFile);
                    await Promise.all(files.map((file) => this.app.vault.delete(file)));
                    result.deletedFiles.push(...files.map((file) => file.path));
                    continue;
                }

                if (folderMode === "folder-only") {
                    const folders = existing.children.filter((child): child is TFolder => child instanceof TFolder);
                    for (const folder of folders) {
                        await this.app.vault.delete(folder, true);
                        result.deletedFolders.push(folder.path);
                    }
                }
            } catch (error) {
                result.success = false;
                result.errors.push({
                    path: targetPath,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return result;
    }

    async moveFile(options: MoveFileOptions): Promise<MoveFileResult> {
        const result: MoveFileResult = {
            success: true,
            moved: [],
            skipped: [],
            errors: [],
        };

        const state = resolveState(options.state, options.variables);
        const engine = new FormTemplateProcessEngine();
        const rawPaths = Array.isArray(options.paths) ? options.paths : [options.paths];
        const resolvedPaths: string[] = [];

        for (const raw of rawPaths) {
            if (Strings.isBlank(raw)) continue;
            const processed = await engine.process(String(raw), state, this.app);
            if (Strings.isBlank(processed)) continue;
            resolvedPaths.push(normalizePath(processed));
        }

        const uniquePaths = Array.from(new Set(resolvedPaths));
        if (uniquePaths.length === 0) {
            result.success = false;
            result.errors.push({ path: "", error: "未提供有效的移动路径" });
            return result;
        }

        const processedTargetFolder = await engine.process(options.targetFolder ?? "", state, this.app);
        const targetFolder = normalizeAndValidatePath(processedTargetFolder);
        if (!targetFolder) {
            result.success = false;
            result.errors.push({ path: "", error: "目标文件夹不能为空" });
            return result;
        }

        const targetFolderFile = this.app.vault.getAbstractFileByPath(targetFolder);
        if (targetFolderFile && !(targetFolderFile instanceof TFolder)) {
            result.success = false;
            result.errors.push({ path: targetFolder, error: "目标路径不是文件夹" });
            return result;
        }

        await ensureFolderExists(this.app, targetFolder);

        const resolver = new PathResolverService(this.app);
        for (const sourcePath of uniquePaths) {
            try {
                const resolveResult = await resolver.resolvePath(sourcePath, {
                    allowFuzzyMatch: true,
                    requireFile: options.moveType === "file",
                    requireFolder: options.moveType === "folder",
                });

                if (!resolveResult.success || (!resolveResult.file && !resolveResult.folder)) {
                    result.success = false;
                    result.errors.push({
                        path: sourcePath,
                        error: resolveResult.error || "文件或文件夹不存在",
                    });
                    continue;
                }

                const source = resolveResult.file || resolveResult.folder;
                if (!source) {
                    result.success = false;
                    result.errors.push({ path: sourcePath, error: "文件或文件夹不存在" });
                    continue;
                }

                let targetPath = buildMoveTargetPath(targetFolder, source.name);

                if (source.path === targetPath) {
                    result.skipped.push({ path: source.path, reason: "源路径与目标路径一致" });
                    continue;
                }

                if (source instanceof TFolder && (targetPath === source.path || targetPath.startsWith(`${source.path}/`))) {
                    result.success = false;
                    result.errors.push({ path: source.path, error: "不能将文件夹移动到自身或其子目录中" });
                    continue;
                }

                const strategy = options.conflictStrategy ?? FileConflictResolution.SKIP;
                const existing = this.app.vault.getAbstractFileByPath(targetPath);
                if (existing) {
                    if (isConflictStrategy(strategy, FileConflictResolution.SKIP)) {
                        result.skipped.push({ path: source.path, reason: "目标路径已存在，已跳过" });
                        continue;
                    }

                    if (isConflictStrategy(strategy, "error")) {
                        result.success = false;
                        result.errors.push({ path: source.path, error: `目标路径已存在: ${targetPath}` });
                        continue;
                    }

                    if (isConflictStrategy(strategy, FileConflictResolution.AUTO_RENAME) || isConflictStrategy(strategy, "rename")) {
                        targetPath = generateAvailablePath(this.app, targetPath, source instanceof TFile);
                    } else {
                        await this.app.vault.delete(existing, existing instanceof TFolder);
                    }
                }

                const parentPath = targetPath.includes("/")
                    ? targetPath.substring(0, targetPath.lastIndexOf("/"))
                    : "";
                if (parentPath) {
                    await ensureFolderExists(this.app, parentPath);
                }

                const from = source.path;
                await this.app.vault.rename(source, targetPath);
                result.moved.push({ from, to: targetPath });
            } catch (error) {
                result.success = false;
                result.errors.push({
                    path: sourcePath,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return result;
    }

    async openFile(options: OpenFileOptions): Promise<OpenFileResult> {
        try {
            const state = resolveState(options.state, options.variables);
            const engine = new FormTemplateProcessEngine();
            const rawPath = await engine.process(options.path ?? "", state, this.app);
            const filePath = normalizeAndValidatePath(rawPath);
            if (!filePath) {
                return {
                    success: false,
                    path: "",
                    mode: "none",
                    error: "文件路径不能为空",
                };
            }

            // 使用模糊路由解析路径
            const resolver = new PathResolverService(this.app);
            const resolveResult = await resolver.resolvePath(filePath, {
                allowFuzzyMatch: true,
                requireFile: true
            });

            if (!resolveResult.success || !resolveResult.file) {
                return {
                    success: false,
                    path: filePath,
                    mode: String(options.mode ?? "tab"),
                    error: resolveResult.error || `文件未找到: ${filePath}`,
                };
            }

            const mode = normalizeOpenMode(options.mode);
            if (mode === "none") {
                return {
                    success: true,
                    path: filePath,
                    mode,
                };
            }

            const normalizedMode =
                mode === "new-tab"
                    ? "tab"
                    : mode === "new-window"
                        ? "window"
                        : mode;
            openFilePathDirectly(this.app, filePath, normalizedMode);
            return {
                success: true,
                path: filePath,
                mode,
            };
        } catch (error) {
            return {
                success: false,
                path: options.path ?? "",
                mode: String(options.mode ?? "tab"),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

}
