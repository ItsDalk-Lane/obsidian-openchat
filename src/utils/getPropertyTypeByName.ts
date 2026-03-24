import { App } from "obsidian";

/**
 * 
 * "aliases" | "checkbox" | "date" | "datetime" | "multitext" | "number" | "tags" | "text" |
 */
export default function getPropertyTypeByName(app: App, name?: string): string {
    if (!name) {
        return "text";
    }

    const lowerName = name.toLowerCase ? name.toLowerCase() : name;
    const propertyInfo = (app as App & {
        metadataTypeManager?: {
            getPropertyInfo?: (propertyName: string) => { widget?: string; type?: string } | null | undefined;
        };
    }).metadataTypeManager?.getPropertyInfo?.(lowerName);
    if (propertyInfo) {
        // @ts-ignore
        if (propertyInfo.widget) {
            // @ts-ignore
            return propertyInfo.widget;
        }
        return propertyInfo.type ?? "text";
    } else {
        return "text";
    }
}
