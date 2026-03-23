import { cloneTarsSettings } from 'src/features/tars';
import type { TarsSettings } from 'src/features/tars';
import { encryptApiKey, decryptApiKey, generateDeviceFingerprint } from 'src/features/tars/utils/cryptoUtils';
import { DebugLogger } from 'src/utils/DebugLogger';

export interface BaseOptions {
    apiKey: string;
    baseURL: string;
    model: string;
    parameters: Record<string, unknown>;
    enableWebSearch?: boolean;
    apiSecret?: string;
    [key: string]: unknown;
}

export interface ProviderConfig {
    tag: string;
    vendor: string;
    options: BaseOptions;
    [key: string]: any;
}

export type VendorApiKeysByDevice = Record<string, Record<string, string>>;

/**
 * 负责 API 密钥与 TarsSettings 的加密 / 解密逻辑
 */
export class SettingsSecretManager {
    readonly currentDeviceFingerprint: string;

    constructor() {
        this.currentDeviceFingerprint = generateDeviceFingerprint();
    }

    normalizeProviderVendor(vendor: string): string {
        return vendor === 'DoubaoImage' ? 'Doubao' : vendor;
    }

    decryptVendorApiKeys(vendorApiKeysByDevice?: VendorApiKeysByDevice): Record<string, string> {
        if (!vendorApiKeysByDevice) return {};
        const result: Record<string, string> = {};
        for (const [vendor, slots] of Object.entries(vendorApiKeysByDevice)) {
            const encrypted = slots?.[this.currentDeviceFingerprint] ?? '';
            const plain = encrypted ? decryptApiKey(encrypted) : '';
            if (plain) {
                result[vendor] = plain;
            }
        }
        return result;
    }

    encryptVendorApiKeys(
        current: VendorApiKeysByDevice | undefined,
        plainApiKeys: Record<string, string> | undefined
    ): VendorApiKeysByDevice | undefined {
        const next: VendorApiKeysByDevice = { ...(current ?? {}) };
        const normalized: Record<string, string> = {};
        for (const [vendor, key] of Object.entries(plainApiKeys ?? {})) {
            const normalizedVendor = this.normalizeProviderVendor(vendor);
            const trimmed = key.trim();
            if (!trimmed) continue;
            normalized[normalizedVendor] = trimmed;
        }

        const allVendors = new Set<string>([
            ...Object.keys(next),
            ...Object.keys(normalized),
        ]);

        for (const vendor of allVendors) {
            const plain = normalized[vendor] ?? '';
            const slots = { ...(next[vendor] ?? {}) };
            if (plain) {
                slots[this.currentDeviceFingerprint] = encryptApiKey(plain);
            } else {
                delete slots[this.currentDeviceFingerprint];
            }

            if (Object.keys(slots).length > 0) {
                next[vendor] = slots;
            } else {
                delete next[vendor];
            }
        }

        return Object.keys(next).length > 0 ? next : undefined;
    }

    decryptTarsSettings(settings?: TarsSettings | undefined): TarsSettings {
        if (!settings) {
            return cloneTarsSettings();
        }
        const vendorApiKeys = this.decryptVendorApiKeys(settings.vendorApiKeysByDevice);
        const providers = (settings.providers ?? []).map((provider: ProviderConfig) => {
            const options = provider.options || {};
            const normalizedVendor = this.normalizeProviderVendor(provider.vendor);
            const resolvedApiKey = vendorApiKeys[normalizedVendor] ?? '';
            const nextOptions: BaseOptions = {
                ...options,
                apiKey: resolvedApiKey,
            };
            delete (nextOptions as Record<string, unknown>).apiKeyByDevice;
            delete (nextOptions as Record<string, unknown>).apiSecretByDevice;

            return {
                ...provider,
                vendor: normalizedVendor,
                options: nextOptions,
            };
        });
        DebugLogger.debug('[SettingsManager] API 密钥按供应商解密完成');
        return cloneTarsSettings({
            ...settings,
            vendorApiKeys,
            providers,
        });
    }

    encryptTarsSettings(settings: TarsSettings): TarsSettings {
        const vendorApiKeysByDevice = this.encryptVendorApiKeys(
            settings.vendorApiKeysByDevice,
            settings.vendorApiKeys
        );
        const providers = (settings.providers ?? []).map((provider: ProviderConfig) => {
            const options = provider.options || {};
            const encrypted: BaseOptions = {
                ...options,
                apiKey: '',
            };
            delete (encrypted as Record<string, unknown>).apiKeyByDevice;
            delete (encrypted as Record<string, unknown>).apiSecretByDevice;
            if (Object.prototype.hasOwnProperty.call(options, 'apiSecret')) {
                encrypted.apiSecret = '';
            }
            return {
                ...provider,
                vendor: this.normalizeProviderVendor(provider.vendor),
                options: encrypted,
            };
        });
        DebugLogger.debug('[SettingsManager] API 密钥按供应商加密完成');
        return cloneTarsSettings({
            ...settings,
            vendorApiKeys: {},
            vendorApiKeysByDevice,
            providers,
        });
    }
}
