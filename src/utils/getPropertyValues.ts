import { App } from "obsidian";
import { Objects } from "./Objects";
import getPropertyTypeByName from "./getPropertyTypeByName";
import { PropertyType } from "./PropertyType";

export function getPropertyValues(app: App, property: string): unknown[] {
    const values = (app.metadataCache as typeof app.metadataCache & {
        getFrontmatterPropertyValuesForKey?: (propertyName: string) => unknown[] | undefined;
    }).getFrontmatterPropertyValuesForKey?.(property);
    const normalizedValues = Array.isArray(values) ? values : [];
    if (!Objects.isNullOrUndefined(values) || normalizedValues.length == 0) {
        const propType = getPropertyTypeByName(app, property);
        if (propType == PropertyType.checkbox) {
            return ["true", "false"];
        }
    }
    return normalizedValues;
}
