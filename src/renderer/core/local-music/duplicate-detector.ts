import { fsUtil } from "@shared/utils/renderer";
import { isInIgnored } from "./ignored-store";

export type DuplicateDetectMode = "standard" | "smart";

export interface FileInfo {
    size: number | null;
    md5: string | null;
    ext: string | null;
}

export interface DuplicateItem {
    item: IMusic.IMusicItem & { $$localPath: string };
    fileInfo: FileInfo;
}

export interface DuplicateGroup {
    key: string;
    items: DuplicateItem[];
    count: number;
    allSameMd5: boolean | null;
    allSameExt: boolean;
}

export interface FormatIssue {
    item: IMusic.IMusicItem & { $$localPath: string };
    issue: "missing-artist" | "missing-title";
}

export interface FileNameIssue {
    item: IMusic.IMusicItem & { $$localPath: string };
    currentFileName: string;
    suggestedFileName: string;
    currentPath: string;
    suggestedPath: string;
    issue: "no-separator" | "wrong-order" | "missing-artist" | "other";
    targetExists?: boolean;
}

const UNKNOWN_ARTIST = "未知艺术家";
const UNKNOWN_TITLE = "未知标题";

function normalizeText(text: string): string {
    return (text || "").trim().toLowerCase();
}

function getLocalPath(item: IMusic.IMusicItem): string | null {
    return (item as any).$$localPath || (item as any).localPath || null;
}

export async function getFileInfo(filePath: string): Promise<FileInfo> {
    try {
        const ext = window.path.extname(filePath).toLowerCase();
        const size = await fsUtil.getFileSize(filePath);
        return { size, md5: null, ext };
    } catch (e) {
        console.error("[getFileInfo] Error:", e);
        return { size: null, md5: null, ext: null };
    }
}

export async function getFileInfoWithMd5(filePath: string): Promise<FileInfo> {
    try {
        const [size, md5] = await Promise.all([
            fsUtil.getFileSize(filePath),
            fsUtil.getFileMd5(filePath),
        ]);
        const ext = window.path.extname(filePath).toLowerCase();
        return { size, md5, ext };
    } catch (e) {
        console.error("[getFileInfoWithMd5] Error:", e);
        return { size: null, md5: null, ext: null };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function detectDuplicates(
    musicList: (IMusic.IMusicItem & { $$localPath: string })[],
    mode: DuplicateDetectMode,
    onProgress?: (current: number, total: number) => void,
): Promise<DuplicateGroup[]> {
    const groups = new Map<string, (IMusic.IMusicItem & { $$localPath: string })[]>();

    for (const item of musicList) {
        if (isInIgnored(item.platform, item.id)) continue;

        const title = normalizeText(item.title || "");
        const artist = normalizeText(item.artist || "");

        if (!title && !artist) continue;

        let key: string;

        if (mode === "standard") {
            key = `${artist}|${title}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(item);
        } else if (mode === "smart") {
            const key1 = `${artist}|${title}`;
            const key2 = `${title}|${artist}`;

            let foundKey: string | null = null;
            for (const existingKey of groups.keys()) {
                if (existingKey === key1 || existingKey === key2) {
                    foundKey = existingKey;
                    break;
                }
            }

            if (foundKey) {
                groups.get(foundKey)!.push(item);
            } else {
                groups.set(key1, [item]);
            }
        }
    }

    const duplicateGroups: DuplicateGroup[] = [];
    const groupsWithDuplicates = Array.from(groups.entries()).filter(([_, items]) => items.length > 1);
    const totalItems = groupsWithDuplicates.reduce((sum, [_, items]) => sum + items.length, 0);
    let processedItems = 0;

    for (const [key, items] of groupsWithDuplicates) {
        const itemsWithInfo: DuplicateItem[] = [];

        for (const item of items) {
            const filePath = getLocalPath(item);
            const fileInfo = filePath ? await getFileInfo(filePath) : { size: null, md5: null, ext: null };
            itemsWithInfo.push({ 
                item: { ...item, $$localPath: filePath || "" } as IMusic.IMusicItem & { $$localPath: string }, 
                fileInfo, 
            });
            processedItems++;
            if (onProgress) {
                onProgress(processedItems, totalItems);
            }
            await sleep(0);
        }

        const extSet = new Set(itemsWithInfo.map(i => i.fileInfo.ext));
        const allSameExt = extSet.size === 1 && !extSet.has(null);

        duplicateGroups.push({
            key,
            items: itemsWithInfo,
            count: items.length,
            allSameMd5: null,
            allSameExt,
        });
    }

    return duplicateGroups;
}

export async function calculateMd5ForGroup(
    group: DuplicateGroup,
    onItemUpdate?: (index: number, fileInfo: FileInfo) => void,
): Promise<DuplicateGroup> {
    const updatedItems: DuplicateItem[] = [];

    for (let i = 0; i < group.items.length; i++) {
        const dupItem = group.items[i];
        const filePath = getLocalPath(dupItem.item);

        if (filePath && !dupItem.fileInfo.md5) {
            const md5 = await fsUtil.getFileMd5(filePath);
            const updatedFileInfo: FileInfo = {
                ...dupItem.fileInfo,
                md5,
            };
            updatedItems.push({
                ...dupItem,
                fileInfo: updatedFileInfo,
            });
            if (onItemUpdate) {
                onItemUpdate(i, updatedFileInfo);
            }
        } else {
            updatedItems.push(dupItem);
        }
        await sleep(0);
    }

    const md5Set = new Set(updatedItems.map(i => i.fileInfo.md5));
    const allSameMd5 = md5Set.size === 1 && !md5Set.has(null);

    return {
        ...group,
        items: updatedItems,
        allSameMd5,
    };
}

export function detectFormatIssues(
    musicList: (IMusic.IMusicItem & { $$localPath: string })[],
): FormatIssue[] {
    const issues: FormatIssue[] = [];

    for (const item of musicList) {
        if (isInIgnored(item.platform, item.id)) continue;

        const artist = (item.artist || "").trim();
        const title = (item.title || "").trim();
        const localPath = getLocalPath(item);

        if (!artist || artist === UNKNOWN_ARTIST) {
            issues.push({
                item: { ...item, $$localPath: localPath || "" } as IMusic.IMusicItem & { $$localPath: string },
                issue: "missing-artist",
            });
        } else if (!title || title === UNKNOWN_TITLE) {
            issues.push({
                item: { ...item, $$localPath: localPath || "" } as IMusic.IMusicItem & { $$localPath: string },
                issue: "missing-title",
            });
        }
    }

    return issues;
}

export function generateStandardFileName(item: IMusic.IMusicItem): string {
    const artist = (item.artist || "").trim() || "未知艺术家";
    const title = (item.title || "").trim() || "未知标题";
    const localPath = getLocalPath(item);

    if (!localPath) {
        return "";
    }

    const ext = window.path.extname(localPath);

    const cleanArtist = artist.replace(/[<>:"/\\|?*]/g, "_");
    const cleanTitle = title.replace(/[<>:"/\\|?*]/g, "_");

    return `${cleanTitle}-${cleanArtist}${ext}`;
}

export async function detectFileNameIssues(
    musicList: (IMusic.IMusicItem & { $$localPath: string })[],
): Promise<FileNameIssue[]> {
    const issues: FileNameIssue[] = [];

    for (const item of musicList) {
        if (isInIgnored(item.platform, item.id)) continue;

        const localPath = getLocalPath(item);
        if (!localPath) continue;

        const currentFileName = window.path.basename(localPath);
        const ext = window.path.extname(localPath);
        const baseName = window.path.basename(localPath, ext);

        let suggestedFileName = "";
        let issue: FileNameIssue["issue"] = "other";

        if (!baseName.includes("-")) {
            issue = "no-separator";
            suggestedFileName = generateStandardFileName(item);
        } else {
            const artist = (item.artist || "").trim();
            const title = (item.title || "").trim();

            if (!artist || artist === UNKNOWN_ARTIST) {
                issue = "missing-artist";
                suggestedFileName = generateStandardFileName(item);
            } else {
                const parts = baseName.split("-");
                if (parts.length >= 2) {
                    const firstPart = parts[0].trim();
                    const secondPart = parts.slice(1).join("-").trim();

                    const artistLower = artist.toLowerCase();
                    const titleLower = title.toLowerCase();
                    const firstPartLower = firstPart.toLowerCase();
                    const secondPartLower = secondPart.toLowerCase();

                    if (firstPartLower === artistLower && secondPartLower === titleLower) {
                        issue = "wrong-order";
                        suggestedFileName = `${secondPart}-${firstPart}${ext}`;
                    }
                }
            }
        }

        if (!suggestedFileName || currentFileName === suggestedFileName) {
            continue;
        }

        const dirPath = window.path.dirname(localPath);
        const suggestedPath = window.path.join(dirPath, suggestedFileName);

        let targetExists = false;
        try {
            targetExists = await fsUtil.isFile(suggestedPath);
        } catch {
            targetExists = false;
        }

        issues.push({
            item: { ...item, $$localPath: localPath } as IMusic.IMusicItem & { $$localPath: string },
            currentFileName,
            suggestedFileName,
            currentPath: localPath,
            suggestedPath,
            issue,
            targetExists,
        });
    }

    return issues;
}

export function getIssueTypeLabel(issue: FileNameIssue["issue"]): string {
    switch (issue) {
        case "no-separator":
            return "文件名缺少分隔符";
        case "wrong-order":
            return "文件名顺序错误";
        case "missing-artist":
            return "文件名缺少艺术家";
        default:
            return "其他格式问题";
    }
}

export function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "未知";
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + units[i];
}
