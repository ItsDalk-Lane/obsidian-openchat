import { App, normalizePath, TFile } from 'obsidian';
import { FormTemplateProcessEngine, type TemplateState } from './engine/FormTemplateProcessEngine';
import type { WriteFileOptions } from './fileOperationTypes';
import { validateAndConvertToString, TypeConversionError, FormFieldValidationError } from 'src/utils/typeSafety';
import { Strings } from 'src/utils/Strings';
import { localInstance } from 'src/i18n/locals';

/** 初始化模板状态，优先使用已有 state，其次用 variables 构造 */
export function resolveState(state?: TemplateState, variables?: Record<string, unknown>): TemplateState {
    if (state) {
        return state;
    }
    return {
        idValues: {},
        values: variables ?? {},
    };
}

/** 规范化并校验路径，不允许包含非法字符 */
export function normalizeAndValidatePath(rawPath: string): string {
    const text = String(rawPath ?? "").trim();
    if (!text) {
        return "";
    }
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(text)) {
        throw new Error("文件路径包含非法字符: < > : \" | ? *");
    }
    const normalized = normalizePath(text);
    const segments = normalized.split("/").filter(Boolean);
    if (segments.some((segment) => segment === "..")) {
        throw new Error("文件路径不能包含 ..");
    }
    return normalized;
}

export function isLikelyDestructiveTextReplacement(
    previousText: string,
    nextText: string
): boolean {
    const previousLength = previousText.trim().length;
    if (previousLength === 0) {
        return false;
    }

    const nextLength = nextText.trim().length;
    if (nextLength === 0) {
        return true;
    }

    return nextLength < previousLength / 2;
}

/** 确保文件夹路径存在（逐级创建） */
export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath).replace(/^\/+/, "");
    if (!normalized || normalized === ".") {
        return;
    }

    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(current)) {
            await app.vault.createFolder(current);
        }
    }
}

/** 解析写入内容：优先用 template，其次用 content */
export async function resolveContent(
    app: App,
    options: WriteFileOptions,
    engine: FormTemplateProcessEngine,
    state: TemplateState
): Promise<string> {
    if (!Strings.isBlank(options.template ?? "")) {
        const templatePath = await validateAndProcessTemplatePath(app, engine, options.template ?? "", state);
        const templateFile = app.vault.getAbstractFileByPath(templatePath);
        if (!templateFile || !(templateFile instanceof TFile)) {
            throw new FormFieldValidationError(
                "templateFile",
                "file path",
                `${localInstance.template_file_not_exists}: ${templatePath}`,
                "请确认模板文件路径是否正确"
            );
        }
        const templateContent = await app.vault.cachedRead(templateFile);
        return await validateAndProcessContent(app, engine, templateContent, state, "template content");
    }
    const content = options.content ?? "";
    return await validateAndProcessContent(app, engine, content, state, "direct content");
}

/** 校验并处理模板文件路径 */
export async function validateAndProcessTemplatePath(
    app: App,
    engine: FormTemplateProcessEngine,
    templatePath: string,
    state: TemplateState
): Promise<string> {
    try {
        const processedPath = await engine.process(templatePath, state, app);
        if (typeof processedPath !== "string") {
            throw new TypeConversionError(
                processedPath,
                "string",
                typeof processedPath,
                "模板文件路径必须是字符串",
                {
                    fieldName: "templateFile",
                    actionType: "write_file",
                    usage: "template file path resolution",
                }
            );
        }
        if (Strings.isBlank(processedPath)) {
            throw new FormFieldValidationError(
                "templateFile",
                "file path",
                "模板文件路径不能为空",
                "请提供有效的模板文件路径"
            );
        }
        return normalizePath(processedPath);
    } catch (error) {
        if (error instanceof TypeConversionError || error instanceof FormFieldValidationError) {
            throw error;
        }
        throw new FormFieldValidationError(
            "templateFile",
            "file path",
            `模板文件路径处理失败: ${error instanceof Error ? error.message : String(error)}`,
            "请检查模板文件路径变量是否正确"
        );
    }
}

/** 校验并处理文件内容（模板变量替换） */
export async function validateAndProcessContent(
    app: App,
    engine: FormTemplateProcessEngine,
    content: string,
    state: TemplateState,
    contentType: string
): Promise<string> {
    try {
        const processedContent = await engine.process(content, state, app);
        return validateAndConvertToString(processedContent, {
            fieldName: "content",
            actionType: "write_file",
            usage: `${contentType} processing`,
        });
    } catch (error) {
        if (error instanceof TypeConversionError || error instanceof FormFieldValidationError) {
            throw error;
        }
        throw new FormFieldValidationError(
            "content",
            "file content",
            `内容处理失败: ${error instanceof Error ? error.message : String(error)}`,
            "请检查内容模板中的变量是否可转换为字符串"
        );
    }
}
