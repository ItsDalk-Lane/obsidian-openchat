import { cloneAiRuntimeSettings } from 'src/settings/ai-runtime';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import { encryptApiKey, decryptApiKey, generateDeviceFingerprint } from 'src/settings/ai-runtime/utils/cryptoUtils';
import type { BaseOptions, ProviderSettings } from 'src/types/provider';
import { DebugLogger } from 'src/utils/DebugLogger';

export type VendorApiKeysByDevice = Record<string, Record<string, string>>;

/**
 * 负责 API 密钥与 AiRuntimeSettings 的加密 / 解密逻辑
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

    decryptAiRuntimeSettings(settings?: AiRuntimeSettings | undefined): AiRuntimeSettings {
        if (!settings) {
            return cloneAiRuntimeSettings();
        }
        const vendorApiKeys = this.decryptVendorApiKeys(settings.vendorApiKeysByDevice);
        const providers = (settings.providers ?? []).map((provider: ProviderSettings) => {
            const options = provider.options || {};
            const normalizedVendor = this.normalizeProviderVendor(provider.vendor);
            const resolvedApiKey = vendorApiKeys[normalizedVendor] ?? '';
            const nextOptions: BaseOptions = {
                ...options,
                apiKey: resolvedApiKey,
                parameters: options.parameters ?? {},
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
        return cloneAiRuntimeSettings({
            ...settings,
            vendorApiKeys,
            providers,
        });
    }

    encryptAiRuntimeSettings(settings: AiRuntimeSettings): AiRuntimeSettings {
        const vendorApiKeysByDevice = this.encryptVendorApiKeys(
            settings.vendorApiKeysByDevice,
            settings.vendorApiKeys
        );
        const providers = (settings.providers ?? []).map((provider: ProviderSettings) => {
            const options = provider.options || {};
            const encrypted: BaseOptions = {
                ...options,
                apiKey: '',
                parameters: options.parameters ?? {},
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
        return cloneAiRuntimeSettings({
            ...settings,
            vendorApiKeys: {},
            vendorApiKeysByDevice,
            providers,
        });
    }
}
