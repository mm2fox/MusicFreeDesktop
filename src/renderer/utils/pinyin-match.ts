import { pinyin } from "pinyin-pro";

function getPinyinInitials(text: string): string {
    if (!text) return "";
    const result = pinyin(text, { pattern: "first", toneType: "none" });
    return result.replace(/\s+/g, "").toLowerCase();
}

function getPinyinFull(text: string): string {
    if (!text) return "";
    const result = pinyin(text, { pattern: "pinyin", toneType: "none" });
    return result.replace(/\s+/g, "").toLowerCase();
}

export function matchByPinyin(text: string, query: string): boolean {
    if (!text || !query) return false;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    if (lowerText.includes(lowerQuery)) {
        return true;
    }
    
    const initials = getPinyinInitials(text);
    if (initials.includes(lowerQuery)) {
        return true;
    }
    
    const fullPinyin = getPinyinFull(text);
    if (fullPinyin.includes(lowerQuery)) {
        return true;
    }
    
    return false;
}
