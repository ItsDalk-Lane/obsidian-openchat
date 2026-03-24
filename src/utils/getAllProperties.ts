import { App } from "obsidian";
import { PropertyType } from "./PropertyType";

export interface Property {
    label?: string;
    name: string;
    // "text" | "number" | "datetime" | "date" | "multitext" | "checkbox";
    type?: string | PropertyType;
}

export function getAllProperties(app: App) {
    const properties: Property[] = [];
    const metadataTypeManager = (app as App & {
        metadataTypeManager?: {
            getAllProperties?: () => Record<string, { name?: string; widget?: string; type?: string }>;
        };
    }).metadataTypeManager;
    const pageProperties = metadataTypeManager?.getAllProperties?.() ?? {};
    // get all values
    for (const property in pageProperties) {
        // @ts-ignore
        const propType = pageProperties[property].widget ?? pageProperties[property].type ?? "text"
        const propertyName = pageProperties[property].name ?? property;
        properties.push({
            name: propertyName,
            label: propertyName,
            type: propType,
        });
    }
    return properties;
}
