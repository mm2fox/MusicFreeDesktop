import { ipcMain } from "electron";
import path from "path";
import fs from "fs/promises";
import fsCb from "fs";
import NodeID3 from "node-id3";
import { parseFile } from "music-metadata";

interface IMusicTags {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    year?: string;
    date?: string;
    genre?: string;
    comment?: string;
    lyrics?: string;
    artwork?: string;
    duration?: number;
}

interface IMusicTagsResult {
    success: boolean;
    tags?: IMusicTags;
    error?: string;
}

const supportedMp3Formats = [".mp3"];
const supportedFlacFormats = [".flac"];

const NodeID3Promise = NodeID3.Promise;

class FlacWriter {
    static async writeTags(filePath: string, tags: IMusicTags): Promise<IMusicTagsResult> {
        try {
            const buffer = await fs.readFile(filePath);
            
            if (buffer.slice(0, 4).toString() !== "fLaC") {
                return { success: false, error: "Not a valid FLAC file" };
            }

            const comments: string[] = [];
            if (tags.title !== undefined) comments.push(`TITLE=${tags.title || ""}`);
            if (tags.artist !== undefined) comments.push(`ARTIST=${tags.artist || ""}`);
            if (tags.album !== undefined) comments.push(`ALBUM=${tags.album || ""}`);
            if (tags.albumArtist !== undefined) comments.push(`ALBUMARTIST=${tags.albumArtist || ""}`);
            if (tags.year !== undefined) comments.push(`DATE=${tags.year || ""}`);
            if (tags.date !== undefined) comments.push(`DATE=${tags.date || ""}`);
            if (tags.genre !== undefined) comments.push(`GENRE=${tags.genre || ""}`);
            if (tags.comment !== undefined) comments.push(`COMMENT=${tags.comment || ""}`);
            if (tags.lyrics !== undefined) comments.push(`LYRICS=${tags.lyrics || ""}`);

            const vendor = "MusicFree";
            const vorbisBuffer = this.createVorbisComment(vendor, comments);
            
            let pictureBuffer: Buffer | null = null;
            if (tags.artwork && tags.artwork !== "") {
                const imageBuffer = this.base64ToBuffer(tags.artwork);
                const mimeType = this.getMimeTypeFromBase64(tags.artwork);
                pictureBuffer = this.createPictureBlock(3, mimeType, "", imageBuffer);
            }

            const result = this.rebuildFlac(buffer, vorbisBuffer, pictureBuffer);
            
            const tempPath = filePath + ".tmp";
            await fs.writeFile(tempPath, result);
            await fs.unlink(filePath);
            await fs.rename(tempPath, filePath);
            
            return { success: true, tags };
        } catch (error: any) {
            return { success: false, error: error?.message || "Failed to write FLAC tags" };
        }
    }

    private static createVorbisComment(vendor: string, comments: string[]): Buffer {
        const vendorBuffer = Buffer.from(vendor, "utf8");
        const parts: Buffer[] = [];
        
        const vendorLen = Buffer.alloc(4);
        vendorLen.writeUInt32LE(vendorBuffer.length, 0);
        parts.push(vendorLen);
        parts.push(vendorBuffer);
        
        const commentCount = Buffer.alloc(4);
        commentCount.writeUInt32LE(comments.length, 0);
        parts.push(commentCount);
        
        for (const comment of comments) {
            const commentBuffer = Buffer.from(comment, "utf8");
            const commentLen = Buffer.alloc(4);
            commentLen.writeUInt32LE(commentBuffer.length, 0);
            parts.push(commentLen);
            parts.push(commentBuffer);
        }
        
        return Buffer.concat(parts);
    }

    private static createPictureBlock(pictureType: number, mimeType: string, description: string, data: Buffer): Buffer {
        const mimeBuffer = Buffer.from(mimeType, "utf8");
        const descBuffer = Buffer.from(description, "utf8");
        
        const parts: Buffer[] = [];
        
        const picType = Buffer.alloc(4);
        picType.writeUInt32BE(pictureType, 0);
        parts.push(picType);
        
        const mimeLen = Buffer.alloc(4);
        mimeLen.writeUInt32BE(mimeBuffer.length, 0);
        parts.push(mimeLen);
        parts.push(mimeBuffer);
        
        const descLen = Buffer.alloc(4);
        descLen.writeUInt32BE(descBuffer.length, 0);
        parts.push(descLen);
        parts.push(descBuffer);
        
        const width = Buffer.alloc(4);
        width.writeUInt32BE(0, 0);
        parts.push(width);
        
        const height = Buffer.alloc(4);
        height.writeUInt32BE(0, 0);
        parts.push(height);
        
        const depth = Buffer.alloc(4);
        depth.writeUInt32BE(0, 0);
        parts.push(depth);
        
        const colors = Buffer.alloc(4);
        colors.writeUInt32BE(0, 0);
        parts.push(colors);
        
        const dataLen = Buffer.alloc(4);
        dataLen.writeUInt32BE(data.length, 0);
        parts.push(dataLen);
        parts.push(data);
        
        return Buffer.concat(parts);
    }

    private static rebuildFlac(original: Buffer, vorbisData: Buffer, pictureData: Buffer | null): Buffer {
        let pos = 4;
        const blocks: { type: number; isLast: boolean; data: Buffer }[] = [];
        
        while (pos < original.length) {
            const header = original.readUInt32BE(pos);
            const isLast = (header & 0x80000000) !== 0;
            const type = (header >>> 24) & 0x7f;
            const length = header & 0xffffff;
            
            const data = original.slice(pos + 4, pos + 4 + length);
            blocks.push({ type, isLast, data });
            
            pos += 4 + length;
            
            if (isLast) break;
        }
        
        const filteredBlocks = blocks.filter(b => 
            b.type !== 4 && b.type !== 6,
        );
        
        const newBlocks: { type: number; isLast: boolean; data: Buffer }[] = [];
        
        for (const block of filteredBlocks) {
            newBlocks.push({ ...block, isLast: false });
        }
        
        newBlocks.push({
            type: 4,
            isLast: pictureData === null,
            data: vorbisData,
        });
        
        if (pictureData) {
            newBlocks.push({
                type: 6,
                isLast: true,
                data: pictureData,
            });
        }
        
        const parts: Buffer[] = [];
        parts.push(Buffer.from("fLaC", "ascii"));
        
        for (const block of newBlocks) {
            const header = Buffer.alloc(4);
            let headerValue = block.data.length;
            headerValue |= (block.type << 24);
            if (block.isLast) {
                headerValue |= 0x80000000;
            }
            header.writeUInt32BE(headerValue >>> 0, 0);
            parts.push(header);
            parts.push(block.data);
        }
        
        const audioData = original.slice(pos);
        parts.push(audioData);
        
        return Buffer.concat(parts);
    }

    private static base64ToBuffer(base64: string): Buffer {
        const base64Data = base64.replace(/^data:[^;]+;base64,/, "");
        return Buffer.from(base64Data, "base64");
    }

    private static getMimeTypeFromBase64(base64: string): string {
        const match = base64.match(/^data:([^;]+);/);
        return match ? match[1] : "image/jpeg";
    }
}

class MusicTagUtil {
    public setup() {
        ipcMain.handle("@shared/music-tag/read", async (_, filePath: string): Promise<IMusicTagsResult> => {
            return await this.readTags(filePath);
        });

        ipcMain.handle("@shared/music-tag/read-without-artwork", async (_, filePath: string): Promise<IMusicTagsResult> => {
            return await this.readTagsWithoutArtwork(filePath);
        });

        ipcMain.handle("@shared/music-tag/write", async (_, filePath: string, tags: IMusicTags): Promise<IMusicTagsResult> => {
            return await this.writeTags(filePath, tags);
        });

        ipcMain.handle("@shared/music-tag/refresh-batch", async (_, filePaths: string[]): Promise<{ success: number; fail: number }> => {
            return await this.refreshBatchTags(filePaths);
        });
    }

    private async refreshBatchTags(filePaths: string[]): Promise<{ success: number; fail: number }> {
        let success = 0;
        let fail = 0;

        for (const filePath of filePaths) {
            try {
                const result = await this.readTags(filePath);
                if (result.success && result.tags) {
                    success++;
                }
            } catch (error) {
                fail++;
            }
        }

        return { success, fail };
    }

    private async readTags(filePath: string): Promise<IMusicTagsResult> {
        try {
            const fileExists = await this.fileExists(filePath);
            if (!fileExists) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`,
                };
            }

            const ext = path.extname(filePath).toLowerCase();
            
            if (supportedMp3Formats.includes(ext)) {
                return await this.readMp3Tags(filePath);
            } else if (supportedFlacFormats.includes(ext)) {
                return await this.readFlacTags(filePath);
            } else {
                const metadata = await parseFile(filePath);
                const common = metadata.common;
                const format = metadata.format;
                let artwork: string | undefined;
                if (common.picture && common.picture.length > 0) {
                    const pic = common.picture[0];
                    artwork = `data:${pic.format};base64,${pic.data.toString("base64")}`;
                }
                return {
                    success: true,
                    tags: {
                        title: common.title,
                        artist: Array.isArray(common.artist) ? common.artist.join(", ") : common.artist,
                        album: common.album,
                        year: common.year?.toString(),
                        genre: Array.isArray(common.genre) ? common.genre.join(", ") : common.genre,
                        comment: Array.isArray(common.comment) ? common.comment.join("\n") : common.comment,
                        artwork,
                        duration: format.duration ? Math.round(format.duration) : undefined,
                    },
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to read tags",
            };
        }
    }

    private async readTagsWithoutArtwork(filePath: string): Promise<IMusicTagsResult> {
        try {
            const fileExists = await this.fileExists(filePath);
            if (!fileExists) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`,
                };
            }

            const ext = path.extname(filePath).toLowerCase();
            
            if (supportedMp3Formats.includes(ext)) {
                return await this.readMp3TagsWithoutArtwork(filePath);
            } else if (supportedFlacFormats.includes(ext)) {
                return await this.readFlacTagsWithoutArtwork(filePath);
            } else {
                const metadata = await parseFile(filePath, { skipCovers: true });
                const common = metadata.common;
                const format = metadata.format;
                return {
                    success: true,
                    tags: {
                        title: common.title,
                        artist: Array.isArray(common.artist) ? common.artist.join(", ") : common.artist,
                        album: common.album,
                        year: common.year?.toString(),
                        genre: Array.isArray(common.genre) ? common.genre.join(", ") : common.genre,
                        comment: Array.isArray(common.comment) ? common.comment.join("\n") : common.comment,
                        duration: format.duration ? Math.round(format.duration) : undefined,
                    },
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to read tags",
            };
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async readMp3Tags(filePath: string): Promise<IMusicTagsResult> {
        try {
            const tags = await NodeID3Promise.read(filePath);
            if (!tags) {
                return {
                    success: false,
                    error: "Failed to read MP3 tags",
                };
            }

            let artwork: string | undefined;
            if (tags.image && (tags.image as any).imageBuffer) {
                const img = tags.image as any;
                const mimeType = img.mime || "image/jpeg";
                artwork = `data:${mimeType};base64,${img.imageBuffer.toString("base64")}`;
            }

            return {
                success: true,
                tags: {
                    title: tags.title || undefined,
                    artist: tags.artist || undefined,
                    album: tags.album || undefined,
                    albumArtist: (tags as any).albumArtist || (tags as any).band || undefined,
                    year: tags.year || undefined,
                    date: (tags as any).date || tags.year || undefined,
                    genre: tags.genre || undefined,
                    comment: typeof tags.comment === "object" ? (tags.comment as any).text : tags.comment || undefined,
                    lyrics: (tags as any).unsynchronisedLyrics?.text || (tags as any).unsynchronisedLyrics || undefined,
                    artwork,
                },
            };
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to read MP3 tags",
            };
        }
    }

    private async readMp3TagsWithoutArtwork(filePath: string): Promise<IMusicTagsResult> {
        try {
            const tags = await NodeID3Promise.read(filePath);
            if (!tags) {
                return {
                    success: false,
                    error: "Failed to read MP3 tags",
                };
            }

            return {
                success: true,
                tags: {
                    title: tags.title || undefined,
                    artist: tags.artist || undefined,
                    album: tags.album || undefined,
                    albumArtist: (tags as any).albumArtist || (tags as any).band || undefined,
                    year: tags.year || undefined,
                    date: (tags as any).date || tags.year || undefined,
                    genre: tags.genre || undefined,
                    comment: typeof tags.comment === "object" ? (tags.comment as any).text : tags.comment || undefined,
                    lyrics: (tags as any).unsynchronisedLyrics?.text || (tags as any).unsynchronisedLyrics || undefined,
                },
            };
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to read MP3 tags",
            };
        }
    }

    private async readFlacTags(filePath: string): Promise<IMusicTagsResult> {
        try {
            const metadata = await parseFile(filePath, {
                skipCovers: false,
            });
            const common = metadata.common;
            const format = metadata.format;

            let artwork: string | undefined;
            try {
                if (common.picture && common.picture.length > 0) {
                    const pic = common.picture[0];
                    artwork = `data:${pic.format};base64,${pic.data.toString("base64")}`;
                }
            } catch (picError: any) {
                console.warn("[MusicTag] Failed to read artwork:", picError?.message);
            }

            return {
                success: true,
                tags: {
                    title: common.title,
                    artist: Array.isArray(common.artist) ? common.artist.join(", ") : common.artist,
                    album: common.album,
                    albumArtist: Array.isArray(common.albumartist) ? common.albumartist.join(", ") : common.albumartist,
                    year: common.year?.toString(),
                    date: common.date || common.year?.toString(),
                    genre: Array.isArray(common.genre) ? common.genre.join(", ") : common.genre,
                    comment: Array.isArray(common.comment) ? common.comment.join("\n") : common.comment,
                    lyrics: Array.isArray(common.lyrics) ? common.lyrics.join("\n") : common.lyrics,
                    artwork,
                    duration: format.duration ? Math.round(format.duration) : undefined,
                },
            };
        } catch (error: any) {
            if (error?.message?.includes("DataView") || error?.message?.includes("Offset")) {
                try {
                    const metadata = await parseFile(filePath, { skipCovers: true });
                    const common = metadata.common;
                    const format = metadata.format;
                    return {
                        success: true,
                        tags: {
                            title: common.title,
                            artist: Array.isArray(common.artist) ? common.artist.join(", ") : common.artist,
                            album: common.album,
                            albumArtist: Array.isArray(common.albumartist) ? common.albumartist.join(", ") : common.albumartist,
                            year: common.year?.toString(),
                            date: (common as any).date || common.year?.toString(),
                            genre: Array.isArray(common.genre) ? common.genre.join(", ") : common.genre,
                            comment: Array.isArray(common.comment) ? common.comment.join("\n") : common.comment,
                            lyrics: Array.isArray((common as any).lyrics) ? (common as any).lyrics.join("\n") : (common as any).lyrics,
                            artwork: undefined,
                            duration: format.duration ? Math.round(format.duration) : undefined,
                        },
                    };
                } catch (retryError: any) {
                    return {
                        success: false,
                        error: retryError?.message || "Failed to read FLAC tags",
                    };
                }
            }
            return {
                success: false,
                error: error?.message || "Failed to read FLAC tags",
            };
        }
    }

    private async readFlacTagsWithoutArtwork(filePath: string): Promise<IMusicTagsResult> {
        try {
            const metadata = await parseFile(filePath, { skipCovers: true });
            const common = metadata.common;
            const format = metadata.format;

            return {
                success: true,
                tags: {
                    title: common.title,
                    artist: Array.isArray(common.artist) ? common.artist.join(", ") : common.artist,
                    album: common.album,
                    albumArtist: Array.isArray(common.albumartist) ? common.albumartist.join(", ") : common.albumartist,
                    year: common.year?.toString(),
                    date: common.date || common.year?.toString(),
                    genre: Array.isArray(common.genre) ? common.genre.join(", ") : common.genre,
                    comment: Array.isArray(common.comment) ? common.comment.join("\n") : common.comment,
                    lyrics: Array.isArray(common.lyrics) ? common.lyrics.join("\n") : common.lyrics,
                    duration: format.duration ? Math.round(format.duration) : undefined,
                },
            };
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to read FLAC tags",
            };
        }
    }

    private async writeTags(filePath: string, tags: IMusicTags): Promise<IMusicTagsResult> {
        try {
            const fileExists = await this.fileExists(filePath);
            if (!fileExists) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`,
                };
            }

            const ext = path.extname(filePath).toLowerCase();
            
            if (supportedMp3Formats.includes(ext)) {
                return await this.writeMp3Tags(filePath, tags);
            } else if (supportedFlacFormats.includes(ext)) {
                return await FlacWriter.writeTags(filePath, tags);
            } else {
                return {
                    success: false,
                    error: `Unsupported format: ${ext}. Only MP3 and FLAC formats are supported for writing.`,
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to write tags",
            };
        }
    }

    private async writeMp3Tags(filePath: string, tags: IMusicTags): Promise<IMusicTagsResult> {
        try {
            const id3Tags: NodeID3.Tags = {};

            if (tags.title !== undefined) id3Tags.title = tags.title || "";
            if (tags.artist !== undefined) id3Tags.artist = tags.artist || "";
            if (tags.album !== undefined) id3Tags.album = tags.album || "";
            if (tags.albumArtist !== undefined) (id3Tags as any).performerInfo = tags.albumArtist || "";
            if (tags.year !== undefined) id3Tags.year = tags.year || "";
            if (tags.date !== undefined) id3Tags.date = tags.date || "";
            if (tags.genre !== undefined) id3Tags.genre = tags.genre || "";
            if (tags.comment !== undefined) {
                if (typeof tags.comment === "string") {
                    id3Tags.comment = {
                        language: "eng",
                        text: tags.comment || "",
                    };
                } else {
                    id3Tags.comment = tags.comment || "";
                }
            }
            if (tags.lyrics !== undefined) {
                id3Tags.unsynchronisedLyrics = {
                    language: "eng",
                    text: tags.lyrics || "",
                };
            }

            if (tags.artwork !== undefined && tags.artwork !== null && tags.artwork !== "") {
                const imageBuffer = Buffer.from(tags.artwork.replace(/^data:[^;]+;base64,/, ""), "base64");
                const mimeType = tags.artwork.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
                id3Tags.image = {
                    mime: mimeType,
                    type: { id: 3, name: "front cover" },
                    imageBuffer: imageBuffer,
                    description: "",
                };
            }

            const success = await NodeID3Promise.update(id3Tags, filePath);
            
            if (success === true) {
                return { success: true, tags };
            } else if (typeof success === "object" && success !== null && (success as any).message) {
                return { success: false, error: (success as any).message || "Failed to write MP3 tags" };
            } else if (typeof success === "boolean" && !success) {
                return { success: false, error: "Failed to write MP3 tags - file may be read-only or locked" };
            } else {
                return { success: true, tags };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || "Failed to write MP3 tags",
            };
        }
    }
}

export default new MusicTagUtil();
export type { IMusicTags, IMusicTagsResult };
