import { App, TFile, normalizePath } from "obsidian";
import { FileConflictResolution } from "src/types/enums/FileConflictResolution";
import { processObTemplate } from "./templates";
import { generateUniqueFilePath } from "./generateUniqueFilePath";
import { convertVariableToString, logTypeConversion, TypeConversionError } from "./typeSafety";
import { DebugLogger } from "./DebugLogger";

export interface CreateFileOptions {
    enableAutoTypeConversion?: boolean;
    strictTypeChecking?: boolean;
    logTypeConversions?: boolean;
    onTypeConversionWarning?: (warning: TypeConversionWarning) => void;
}

export interface TypeConversionWarning {
    fieldName?: string;
    originalType: string;
    originalValue: unknown;
    convertedValue: string;
    location: string;
    timestamp: string;
}

export async function createFileByText(
    app: App,
    newFilePath: string,
    template: string,
    conflictResolution: FileConflictResolution = FileConflictResolution.SKIP,
    options: CreateFileOptions = {}
): Promise<TFile> {
    const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 预留用于扩展
        enableAutoTypeConversion = true,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 预留用于扩展
        strictTypeChecking = false,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 预留用于扩展
        logTypeConversions = false,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 预留用于扩展
        onTypeConversionWarning
    } = options;

    // Validate and convert file path
    const validatedFilePath = await validateAndConvertFilePath(newFilePath, options);

    // Validate and convert template content
    const validatedTemplate = await validateAndConvertTemplate(template, options);

    return await createFileWithValidatedContent(
        app,
        validatedFilePath,
        validatedTemplate,
        conflictResolution,
        options
    );
}

/**
 * Validates and converts file path to ensure it's a string
 */
async function validateAndConvertFilePath(
    filePath: unknown,
    options: CreateFileOptions
): Promise<string> {
    const { enableAutoTypeConversion, strictTypeChecking, logTypeConversions } = options;

    if (typeof filePath === 'string') {
        return filePath;
    }

    const originalType = typeof filePath;
    const originalValue = filePath;
    let convertedValue: string;

    try {
        if (enableAutoTypeConversion) {
            convertedValue = convertVariableToString(filePath);

            const warning: TypeConversionWarning = {
                originalType,
                originalValue,
                convertedValue,
                location: 'createFileByText - filePath validation',
                timestamp: new Date().toISOString()
            };

            if (logTypeConversions) {
                logTypeConversion(
                    {
                        fieldName: 'filePath',
                        usage: 'file path creation',
                        location: 'createFileByText'
                    },
                    originalValue,
                    convertedValue,
                    true
                );
            }

            DebugLogger.warn(`File path type conversion: ${originalType} "${originalValue}" → string "${convertedValue}"`, warning);

            return convertedValue;
        } else {
            throw new TypeConversionError(
                originalValue,
                'string',
                originalType,
                `File path must be a string, got ${originalType}`,
                {
                    fieldName: 'filePath',
                    actionType: 'create_file',
                    usage: 'file path creation'
                }
            );
        }
    } catch (error) {
        if (strictTypeChecking) {
            throw error;
        }
        const errorText = error instanceof Error ? error.message : String(error);

        // Fallback to string conversion in non-strict mode
        convertedValue = String(filePath);
        DebugLogger.warn(`File path type conversion fallback: ${originalType} → string`, {
            originalValue,
            convertedValue,
            error: errorText
        });

        return convertedValue;
    }
}

/**
 * Validates and converts template content to ensure it's a string
 */
async function validateAndConvertTemplate(
    template: unknown,
    options: CreateFileOptions
): Promise<string> {
    const { enableAutoTypeConversion, strictTypeChecking, logTypeConversions } = options;

    if (typeof template === 'string') {
        return template;
    }

    const originalType = typeof template;
    const originalValue = template;
    let convertedValue: string;

    try {
        if (enableAutoTypeConversion) {
            convertedValue = convertVariableToString(template);

            const warning: TypeConversionWarning = {
                originalType,
                originalValue,
                convertedValue,
                location: 'createFileByText - template validation',
                timestamp: new Date().toISOString()
            };

            if (logTypeConversions) {
                logTypeConversion(
                    {
                        fieldName: 'template',
                        usage: 'file content creation',
                        location: 'createFileByText'
                    },
                    originalValue,
                    convertedValue,
                    true
                );
            }

            DebugLogger.warn(`Template content type conversion: ${originalType} → string`, warning);

            return convertedValue;
        } else {
            throw new TypeConversionError(
                originalValue,
                'string',
                originalType,
                `Template content must be a string, got ${originalType}`,
                {
                    fieldName: 'template',
                    actionType: 'create_file',
                    usage: 'file content creation'
                }
            );
        }
    } catch (error) {
        if (strictTypeChecking) {
            throw error;
        }
        const errorText = error instanceof Error ? error.message : String(error);

        // Fallback conversion strategies based on type
        if (originalValue === null || originalValue === undefined) {
            convertedValue = '';
        } else if (typeof originalValue === 'object') {
            try {
                convertedValue = JSON.stringify(originalValue, null, 2);
            } catch {
                convertedValue = String(originalValue);
            }
        } else {
            convertedValue = String(originalValue);
        }

        DebugLogger.warn(`Template content type conversion fallback: ${originalType} → string`, {
            originalValue,
            convertedValue,
            error: errorText
        });

        return convertedValue;
    }
}

/**
 * Creates file with validated string content
 */
async function createFileWithValidatedContent(
    app: App,
    newFilePath: string,
    template: string,
    conflictResolution: FileConflictResolution,
    options: CreateFileOptions
): Promise<TFile> {
    const parent = newFilePath.substring(0, newFilePath.lastIndexOf("/"));
    const isExists = parent.length === 0
        ? true
        : Boolean(app.vault.getAbstractFileByPath(parent));
    if (!isExists) {
        await app.vault.createFolder(parent);
    }

    const normalizedNewFilePath = normalizePath(newFilePath);
    const existingFile = app.vault.getAbstractFileByPath(normalizedNewFilePath);

    if (existingFile != null) {
        switch (conflictResolution) {
            case FileConflictResolution.SKIP:
                return Promise.resolve(existingFile as TFile);

            case FileConflictResolution.AUTO_RENAME: {
                const uniquePath = generateUniqueFilePath(app, normalizedNewFilePath);
                const processedTemplate = processObTemplate(template);
                return await app.vault.create(uniquePath, processedTemplate);
            }

            case FileConflictResolution.OVERWRITE: {
                if (existingFile instanceof TFile) {
                    const processedTemplate = processObTemplate(template);
                    await app.vault.modify(existingFile, processedTemplate);
                    return existingFile;
                } else {
                    throw new Error(`Cannot overwrite non-file: ${newFilePath}`);
                }
            }

            default:
                throw new Error(`Unknown conflict resolution strategy: ${conflictResolution}`);
        }
    }

    const processedTemplate = processObTemplate(template);
    return await app.vault.create(normalizedNewFilePath, processedTemplate);
}
