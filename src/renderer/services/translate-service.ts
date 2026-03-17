import AppConfig from "@shared/app-config/renderer";

export type TranslateServiceProvider = "libretranslate" | "mymemory" | "baidu";
export type BaiduTranslateType = "standard" | "llm";

function md5(string: string): string {
    function md5cycle(x: number[], k: number[]) {
        let a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }

    function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }

    function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }

    function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }

    function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    }

    function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    }

    function md51(s: string) {
        const n = s.length;
        const state = [1732584193, -271733879, -1732584194, 271733878];
        let i;
        for (i = 64; i <= s.length; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++)
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }

    function md5blk(s: string) {
        const md5blks = [];
        for (let i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }

    const hex_chr = "0123456789abcdef".split("");

    function rhex(n: number) {
        let s = "";
        for (let j = 0; j < 4; j++)
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        return s;
    }

    function hex(x: number[]) {
        return x.map(rhex).join("");
    }

    function add32(a: number, b: number) {
        return (a + b) & 0xFFFFFFFF;
    }

    return hex(md51(string));
}

interface TranslateApi {
    name: string;
    requiresKey: boolean;
    translate: (text: string, signal?: AbortSignal) => Promise<string | null>;
}

const createLibreTranslateApi = (targetLang: TargetLanguage): TranslateApi => ({
    name: "LibreTranslate",
    requiresKey: false,
    translate: async (text: string, signal?: AbortSignal): Promise<string | null> => {
        try {
            const response = await fetch("https://libretranslate.de/translate", {
                method: "POST",
                body: JSON.stringify({
                    q: text,
                    source: "auto",
                    target: targetLang,
                    format: "text",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
                signal,
            });
            
            if (!response.ok) return null;
            
            const data = await response.json();
            return data.translatedText || null;
        } catch {
            return null;
        }
    },
});

const createMyMemoryApi = (targetLang: TargetLanguage): TranslateApi => ({
    name: "MyMemory",
    requiresKey: false,
    translate: async (text: string, signal?: AbortSignal): Promise<string | null> => {
        try {
            const langPair = `autodetect|${targetLang}`;
            const response = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`,
                { signal },
            );
            
            if (!response.ok) return null;
            
            const data = await response.json();
            if (data.responseStatus === 200 && data.responseData?.translatedText) {
                return data.responseData.translatedText;
            }
            return null;
        } catch {
            return null;
        }
    },
});

const createBaiduStandardApi = (appId: string, secretKey: string, targetLang: TargetLanguage): TranslateApi => ({
    name: "百度翻译(标准版)",
    requiresKey: true,
    translate: async (text: string, signal?: AbortSignal): Promise<string | null> => {
        if (!appId || !secretKey) return null;
        
        try {
            const salt = Date.now().toString();
            const sign = await generateBaiduSign(appId, text, salt, secretKey);
            
            const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=auto&to=${targetLang}&appid=${appId}&salt=${salt}&sign=${sign}`;
            console.log("[BaiduStandard] Request URL:", url.substring(0, 200));
            
            const response = await fetch(url, { signal });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("[BaiduStandard] Error response:", errorText);
                return null;
            }
            
            const data = await response.json();
            console.log("[BaiduStandard] Response data:", data);
            
            if (data.error_code) {
                console.error("[BaiduStandard] API error:", data.error_code, data.error_msg);
                return null;
            }
            
            if (data.trans_result && Array.isArray(data.trans_result)) {
                return data.trans_result.map((item: any) => item.dst).join("\n");
            }
            
            console.error("[BaiduStandard] No trans_result in response:", data);
            return null;
        } catch (error) {
            console.error("[BaiduStandard] Error:", error);
            return null;
        }
    },
});

const createBaiduLLMApi = (appId: string, apiKey: string, targetLang: TargetLanguage): TranslateApi => ({
    name: "百度翻译(大模型)",
    requiresKey: true,
    translate: async (text: string, signal?: AbortSignal): Promise<string | null> => {
        if (!appId || !apiKey) {
            throw new Error("百度翻译(大模型) 未配置 APP ID 和 API Key");
        }
        
        try {
            console.log("[BaiduLLM] Request:", {
                appid: appId,
                from: "auto",
                to: targetLang,
                q: text.substring(0, 50) + "...",
            });
            
            const response = await fetch(
                "https://fanyi-api.baidu.com/ait/api/aiTextTranslate",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        appid: appId,
                        from: "auto",
                        to: targetLang,
                        q: text,
                    }),
                    signal,
                },
            );
            
            console.log("[BaiduLLM] Response status:", response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("[BaiduLLM] Error response:", errorText);
                throw new Error(`百度翻译(大模型) HTTP错误: ${response.status}`);
            }
            
            const data = await response.json();
            console.log("[BaiduLLM] Full response:", JSON.stringify(data, null, 2));
            
            if (data.error_code) {
                console.error("[BaiduLLM] API error:", data.error_code, data.error_msg);
                throw new Error(`百度翻译(大模型) API错误: ${data.error_code} - ${data.error_msg}`);
            }
            
            if (data.trans_result && Array.isArray(data.trans_result)) {
                console.log("[BaiduLLM] Found trans_result array with", data.trans_result.length, "items");
                const translatedText = data.trans_result.map((item: any) => item.dst).join("\n");
                return translatedText;
            }
            
            if (data.data && data.data.trans_result && data.data.trans_result[0]) {
                console.log("[BaiduLLM] Found result in data.data.trans_result");
                return data.data.trans_result[0].dst;
            }
            
            if (data.result) {
                console.log("[BaiduLLM] Found result in result field");
                return data.result;
            }
            
            console.error("[BaiduLLM] No result in response:", data);
            throw new Error("百度翻译(大模型) 返回数据格式错误: 缺少翻译结果");
        } catch (error) {
            console.error("[BaiduLLM] Error:", error);
            throw error;
        }
    },
});

async function generateBaiduSign(appId: string, query: string, salt: string, secretKey: string): Promise<string> {
    const str = appId + query + salt + secretKey;
    return md5(str);
}

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000;

export type TargetLanguage = "zh" | "ja" | "ko" | "en";

export const TARGET_LANGUAGES: { value: TargetLanguage; label: string }[] = [
    { value: "zh", label: "中文" },
    { value: "ja", label: "日语" },
    { value: "ko", label: "韩语" },
    { value: "en", label: "英语" },
];

const chineseCharRegex = /[\u4e00-\u9fff]/;

export function containsChinese(text: string): boolean {
    return chineseCharRegex.test(text);
}

export function isLyricChinese(rawLrc: string): boolean {
    if (!rawLrc) return false;
    const lines = rawLrc.split("\n").filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith("[")) {
            const closingBracket = trimmed.indexOf("]");
            if (closingBracket !== -1) {
                const content = trimmed.substring(closingBracket + 1).trim();
                return content.length > 0;
            }
            return false;
        }
        return true;
    });
    if (lines.length === 0) return false;
    let chineseCharCount = 0;
    let totalCharCount = 0;
    for (const line of lines) {
        let content = line;
        const bracketIdx = line.indexOf("]");
        if (bracketIdx !== -1) {
            content = line.substring(bracketIdx + 1);
        }
        for (const char of content) {
            if (/[\u4e00-\u9fff]/.test(char)) {
                chineseCharCount++;
            }
            if (/[a-zA-Z\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(char)) {
                totalCharCount++;
            }
        }
    }
    if (totalCharCount === 0) return false;
    return chineseCharCount / totalCharCount > 0.5;
}

export function getAutoTranslateNonChinese(): boolean {
    return AppConfig.getConfig("translate.autoTranslateNonChinese") ?? true;
}

export function setAutoTranslateNonChinese(enabled: boolean): void {
    AppConfig.setConfig({ "translate.autoTranslateNonChinese": enabled });
}

export function getTargetLanguage(): TargetLanguage {
    return AppConfig.getConfig("translate.targetLanguage") || "zh";
}

export function setTargetLanguage(lang: TargetLanguage): void {
    AppConfig.setConfig({ "translate.targetLanguage": lang });
}

export function getTranslateServiceProvider(): TranslateServiceProvider {
    return AppConfig.getConfig("translate.provider") || "libretranslate";
}

export function setTranslateServiceProvider(provider: TranslateServiceProvider): void {
    AppConfig.setConfig({ "translate.provider": provider });
}

export function getBaiduTranslateType(): BaiduTranslateType {
    return AppConfig.getConfig("translate.baiduType") || "standard";
}

export function setBaiduTranslateType(type: BaiduTranslateType): void {
    AppConfig.setConfig({ "translate.baiduType": type });
}

export function getBaiduStandardCredentials(): { appId: string; secretKey: string } {
    return {
        appId: AppConfig.getConfig("translate.baiduAppId") || "",
        secretKey: AppConfig.getConfig("translate.baiduSecretKey") || "",
    };
}

export function setBaiduStandardCredentials(appId: string, secretKey: string): void {
    AppConfig.setConfig({
        "translate.baiduAppId": appId,
        "translate.baiduSecretKey": secretKey,
    });
}

export function getBaiduLLMCredentials(): { appId: string; apiKey: string } {
    return {
        appId: AppConfig.getConfig("translate.baiduLLMAppId") || "",
        apiKey: AppConfig.getConfig("translate.baiduLLMApiKey") || "",
    };
}

export function setBaiduLLMCredentials(appId: string, apiKey: string): void {
    AppConfig.setConfig({
        "translate.baiduLLMAppId": appId,
        "translate.baiduLLMApiKey": apiKey,
    });
}

export function getAvailableProviders(): { value: TranslateServiceProvider; label: string; requiresKey: boolean }[] {
    return [
        { value: "baidu", label: "百度翻译", requiresKey: true },
        { value: "libretranslate", label: "LibreTranslate", requiresKey: false },
        { value: "mymemory", label: "MyMemory", requiresKey: false },
    ];
}

export function getBaiduTypes(): { value: BaiduTranslateType; label: string; description: string }[] {
    return [
        { value: "standard", label: "标准版", description: "在 fanyi-api.baidu.com 申请" },
        { value: "llm", label: "大模型版", description: "在 fanyi-api.baidu.com 申请" },
    ];
}

export interface TranslateResult {
    success: boolean;
    text: string;
    provider?: string;
    error?: string;
}

export async function translateText(
    text: string, 
    signal?: AbortSignal,
): Promise<TranslateResult> {
    if (!text || text.trim() === "") {
        return { success: true, text: "" };
    }

    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    const preferredProvider = getTranslateServiceProvider();
    const baiduType = getBaiduTranslateType();
    const baiduStandardCreds = getBaiduStandardCredentials();
    const baiduLLMCreds = getBaiduLLMCredentials();
    const targetLang = getTargetLanguage();
    
    let api: TranslateApi | null = null;
    
    if (preferredProvider === "baidu") {
        if (baiduType === "llm") {
            if (baiduLLMCreds.appId && baiduLLMCreds.apiKey) {
                api = createBaiduLLMApi(baiduLLMCreds.appId, baiduLLMCreds.apiKey, targetLang);
            } else {
                return {
                    success: false,
                    text: "",
                    error: "百度翻译(大模型) 未配置 APP ID 和 API Key",
                };
            }
        } else {
            if (baiduStandardCreds.appId && baiduStandardCreds.secretKey) {
                api = createBaiduStandardApi(baiduStandardCreds.appId, baiduStandardCreds.secretKey, targetLang);
            } else {
                return {
                    success: false,
                    text: "",
                    error: "百度翻译(标准版) 未配置 APP ID 和密钥",
                };
            }
        }
    } else if (preferredProvider === "libretranslate") {
        api = createLibreTranslateApi(targetLang);
    } else if (preferredProvider === "mymemory") {
        api = createMyMemoryApi(targetLang);
    }
    
    if (!api) {
        return {
            success: false,
            text: "",
            error: "未知的翻译服务",
        };
    }
    
    try {
        const result = await api.translate(text, signal);
        
        if (result) {
            return { 
                success: true, 
                text: result, 
                provider: api.name, 
            };
        }
        
        return {
            success: false,
            text: "",
            error: `${api.name} 翻译失败`,
        };
    } catch (error) {
        if ((error as Error).name === "AbortError") {
            return { 
                success: false, 
                text: "", 
                error: "Translation cancelled", 
            };
        }
        console.warn(`[AutoTranslate] Provider ${api.name} failed:`, error);
        return {
            success: false,
            text: "",
            error: `${api.name} 翻译失败: ${(error as Error).message}`,
        };
    }
}

export interface TranslateLyricResult {
    success: boolean;
    lines: string[];
    failedCount: number;
    provider?: string;
    error?: string;
}

export async function translateLyricLines(
    lines: string[],
    signal?: AbortSignal,
    onProgress?: (current: number, total: number) => void,
): Promise<TranslateLyricResult> {
    const linesToTranslate = lines.filter(l => l && l.trim());
    if (linesToTranslate.length === 0) {
        return {
            success: true,
            lines: lines.map(() => ""),
            failedCount: 0,
        };
    }
    
    const preferredProvider = getTranslateServiceProvider();
    
    if (preferredProvider === "baidu") {
        return translateLyricLinesBatch(lines, signal, onProgress);
    }
    
    return translateLyricLinesOneByOne(lines, signal, onProgress);
}

async function translateLyricLinesBatch(
    lines: string[],
    signal?: AbortSignal,
    onProgress?: (current: number, total: number) => void,
): Promise<TranslateLyricResult> {
    const results: string[] = new Array(lines.length).fill("");
    let failedCount = 0;
    let lastProvider: string | undefined;
    
    const MAX_CHARS = 5000;
    const batches: { start: number; end: number; lines: string[]; originalIndices: number[] }[] = [];
    let currentBatchLines: string[] = [];
    let currentBatchIndices: number[] = [];
    let currentLength = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || "";
        
        if (!line.trim()) {
            continue;
        }
        
        const lineLength = line.length + 1;
        
        if (currentLength + lineLength > MAX_CHARS && currentBatchLines.length > 0) {
            batches.push({
                start: batches.length > 0 ? batches[batches.length - 1].end : 0,
                end: i,
                lines: [...currentBatchLines],
                originalIndices: [...currentBatchIndices],
            });
            currentBatchLines = [];
            currentBatchIndices = [];
            currentLength = 0;
        }
        
        currentBatchLines.push(line);
        currentBatchIndices.push(i);
        currentLength += lineLength;
    }
    
    if (currentBatchLines.length > 0) {
        batches.push({
            start: batches.length > 0 ? batches[batches.length - 1].end : 0,
            end: lines.length,
            lines: currentBatchLines,
            originalIndices: currentBatchIndices,
        });
    }
    
    console.log(`[AutoTranslate] Split into ${batches.length} batches`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (signal?.aborted) {
            return {
                success: false,
                lines: results,
                failedCount,
                error: "Translation cancelled",
            };
        }
        
        const batch = batches[batchIndex];
        console.log(`[AutoTranslate] Translating batch ${batchIndex + 1}/${batches.length}, lines: ${batch.lines.length}, chars: ${batch.lines.join("\n").length}`);
        
        const batchText = batch.lines.join("\n");
        const result = await translateText(batchText, signal);
        
        if (result.success && result.text) {
            const translatedLines = result.text.split("\n");
            
            for (let i = 0; i < batch.originalIndices.length && i < translatedLines.length; i++) {
                const originalIndex = batch.originalIndices[i];
                results[originalIndex] = translatedLines[i] || "";
            }
            
            lastProvider = result.provider;
        } else {
            failedCount += batch.lines.length;
            console.error(`[AutoTranslate] Batch ${batchIndex + 1} failed:`, result.error);
        }
        
        if (onProgress) {
            onProgress(batchIndex + 1, batches.length);
        }
    }
    
    const totalLines = lines.filter(l => l && l.trim()).length;
    const success = failedCount < totalLines;
    
    return {
        success,
        lines: results,
        failedCount,
        provider: lastProvider,
        error: success ? undefined : "All batches failed",
    };
}

async function translateLyricLinesOneByOne(
    lines: string[],
    signal?: AbortSignal,
    onProgress?: (current: number, total: number) => void,
): Promise<TranslateLyricResult> {
    const results: string[] = [];
    let failedCount = 0;
    let lastProvider: string | undefined;
    let firstError: string | undefined;
    
    const linesToTranslate = lines.filter(l => l && l.trim());
    if (linesToTranslate.length === 0) {
        return {
            success: true,
            lines: lines.map(() => ""),
            failedCount: 0,
        };
    }
    
    const testResult = await translateText(linesToTranslate[0], signal);
    if (!testResult.success) {
        return {
            success: false,
            lines: [],
            failedCount: linesToTranslate.length,
            error: testResult.error || "翻译服务不可用",
        };
    }
    
    results.push(testResult.text || "");
    lastProvider = testResult.provider;
    if (onProgress) {
        onProgress(1, lines.length);
    }
    
    for (let i = 0; i < lines.length; i++) {
        if (i === 0) continue;
        
        if (signal?.aborted) {
            return {
                success: false,
                lines: results,
                failedCount,
                error: "Translation cancelled",
            };
        }
        
        const line = lines[i];
        
        if (!line || line.trim() === "") {
            results.push("");
        } else {
            const result = await translateText(line, signal);
            if (result.success && result.text) {
                results.push(result.text);
                lastProvider = result.provider;
            } else {
                results.push("");
                failedCount++;
                if (!firstError) {
                    firstError = result.error;
                }
            }
        }
        
        if (onProgress) {
            onProgress(i + 1, lines.length);
        }
    }
    
    const totalLines = lines.filter(l => l && l.trim()).length;
    const success = failedCount < totalLines / 2;
    
    return {
        success,
        lines: results,
        failedCount,
        provider: lastProvider,
        error: success ? undefined : (firstError || `Failed to translate ${failedCount} lines`),
    };
}

export default {
    translateText,
    translateLyricLines,
    getTranslateServiceProvider,
    setTranslateServiceProvider,
    getBaiduTranslateType,
    setBaiduTranslateType,
    getBaiduStandardCredentials,
    setBaiduStandardCredentials,
    getBaiduLLMCredentials,
    setBaiduLLMCredentials,
    getAvailableProviders,
    getBaiduTypes,
};
