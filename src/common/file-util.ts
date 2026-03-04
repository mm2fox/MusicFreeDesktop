import { ICommonTagsResult, IPicture, parseFile } from "music-metadata";
import path from "path";
import { localPluginName, supportLocalMediaType } from "./constant";
import CryptoJS from "crypto-js";
import fs from "fs/promises";
import url from "url";
import type { BigIntStats, PathLike, StatOptions, Stats } from "original-fs";
import jschardet from "jschardet";
import iconv from "iconv-lite";

function getB64Picture(picture: IPicture) {
    return `data:${picture.format};base64,${picture.data.toString("base64")}`;
}

const specialEncoding = ["GB2312"];

export async function parseLocalMusicItem(
    filePath: string,
): Promise<IMusic.IMusicItem> {
    const hash = CryptoJS.MD5(filePath).toString();
    try {
        const { common = {} as ICommonTagsResult, format } = await parseFile(filePath);

        let encoding: string | null = null;
        let conf = 0;
        const testItems = [common.title, common.artist, common.album];

        for (const testItem of testItems) {
            if (!testItem) {
                continue;
            }
            const testResult = jschardet.detect(testItem, {
                minimumThreshold: 0.4,
            });
            if (testResult.confidence > conf) {
                conf = testResult.confidence;
                encoding = testResult.encoding;
            }

            if (conf > 0.9) {
                break;
            }
        }

        if (specialEncoding.includes(encoding)) {
            if (common.title) {
                common.title = iconv.decode(
                    common.title as unknown as Buffer,
                    encoding,
                );
            }
            if (common.artist) {
                common.artist = iconv.decode(
                    common.artist as unknown as Buffer,
                    encoding,
                );
            }
            if (common.album) {
                common.album = iconv.decode(
                    common.album as unknown as Buffer,
                    encoding,
                );
            }
            if (common.lyrics) {
                common.lyrics = common.lyrics.map((it) =>
                    it ? iconv.decode(it as unknown as Buffer, encoding) : "",
                );
            }
        }

        let artistStr = "未知作者";
        if (common.artist) {
            if (Array.isArray(common.artist)) {
                artistStr = common.artist.filter(Boolean).join(", ") || "未知作者";
            } else {
                artistStr = String(common.artist);
            }
        } else if (common.artists && Array.isArray(common.artists)) {
            artistStr = common.artists.filter(Boolean).join(", ") || "未知作者";
        }

        return {
            title: common.title ?? path.parse(filePath).name,
            artist: artistStr,
            artwork: common.picture?.[0]
                ? getB64Picture(common.picture[0])
                : undefined,
            album: common.album ?? "未知专辑",
            duration: format.duration ? Math.round(format.duration) : undefined,
            year: common.year?.toString(),
            genre: Array.isArray(common.genre) ? common.genre.join(", ") : common.genre,
            comment: Array.isArray(common.comment) ? common.comment.join("\n") : common.comment,
            url: addFileScheme(filePath),
            localPath: filePath,
            platform: localPluginName,
            id: hash,
            rawLrc: common.lyrics?.join(""),
        };
    } catch (e) {
        return {
            title: path.parse(filePath).name || filePath,
            id: hash,
            platform: localPluginName,
            localPath: filePath,
            url: addFileScheme(filePath),
            artist: "未知作者",
            album: "未知专辑",
        };
    }
}

export async function parseLocalMusicItemWithoutTags(
    filePath: string,
): Promise<IMusic.IMusicItem> {
    const hash = CryptoJS.MD5(filePath).toString();
    return {
        title: path.parse(filePath).name || filePath,
        id: hash,
        platform: localPluginName,
        localPath: filePath,
        url: addFileScheme(filePath),
        artist: "未知作者",
        album: "未知专辑",
    };
}

export async function parseLocalMusicItemFolder(
    folderPath: string,
): Promise<IMusic.IMusicItem[]> {
    /**
   * 1. 筛选出符合条件的
   */

    try {
        const folderStat = await fs.stat(folderPath);
        if (folderStat.isDirectory()) {
            const files = await fs.readdir(folderPath);
            const validFiles = files.filter((fp) =>
                supportLocalMediaType.some((postfix) => fp.endsWith(postfix)),
            );
            // TODO: 分片
            return Promise.all(
                validFiles.map((fp) =>
                    parseLocalMusicItem(path.resolve(folderPath, fp)),
                ),
            );
        }
        throw new Error("Folder Not Found");
    } catch {
        return [];
    }
}

export function addFileScheme(filePath: string) {
    return filePath.startsWith("file:")
        ? filePath
        : url.pathToFileURL(filePath).toString();
}

export function addTailSlash(filePath: string) {
    return filePath.endsWith("/") || filePath.endsWith("\\")
        ? filePath
        : filePath + "/";
}

export async function safeStat(
    path: PathLike,
    opts?: StatOptions,
): Promise<Stats | BigIntStats | null> {
    try {
        return await fs.stat(path, opts);
    } catch {
        return null;
    }
}
