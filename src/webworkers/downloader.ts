import * as Comlink from "comlink";
import fs from "fs";
import fsPromises from "fs/promises";
import { Readable } from "stream";
import { encodeUrlHeaders } from "@/common/normalize-util";
import throttle from "lodash.throttle";
import { DownloadState as DownloadState } from "@/common/constant";
import { rimraf } from "rimraf";

async function cleanFile(filePath: string) {
    try {
        if ((await fsPromises.stat(filePath).catch(() => null))?.isFile()) {
            await rimraf(filePath);
        }
        return true;
    } catch {
        return false;
    }
}

const responseToReadable = (
    response: Response,
    options?: {
        onRead?: (size: number) => void;
        onDone?: () => void;
        onError?: (e: Error) => void;
    },
) => {
    const reader = response.body.getReader();
    const rs = new Readable();
    let size = 0;
    const tOnRead = throttle(options?.onRead, 64, {
        leading: true,
        trailing: true,
    });
    rs._read = async () => {
        const result = await reader.read();
        if (!result.done) {
            rs.push(Buffer.from(result.value));
            size += result.value.byteLength;
            tOnRead?.(size);
        } else {
            rs.push(null);
            options?.onDone?.();
            return;
        }
    };
    rs.on("error", options?.onError);
    return rs;
};

type IOnStateChangeFunc = (data: {
    state: DownloadState;
    downloaded?: number;
    total?: number;
    msg?: string;
}) => void;

async function downloadFile(
    mediaSource: IMusic.IMusicSource,
    filePath: string,
    onStateChange: IOnStateChangeFunc,
) {
    let state = DownloadState.DOWNLOADING;
    let hasError = false;
    try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            state = DownloadState.ERROR;
            hasError = true;
            onStateChange?.({
                state,
                msg: "Filepath is a directory",
            });
            return;
        }
    } catch (e) {}
    const _headers: Record<string, string> = {
        ...(mediaSource.headers ?? {}),
        "user-agent": mediaSource.userAgent,
    };

    try {
        const urlObj = new URL(mediaSource.url);
        let res: Response;
        if (urlObj.username && urlObj.password) {
            _headers["Authorization"] = `Basic ${btoa(
                `${decodeURIComponent(urlObj.username)}:${decodeURIComponent(
                    urlObj.password,
                )}`,
            )}`;
            urlObj.username = "";
            urlObj.password = "";
            res = await fetch(urlObj.toString(), {
                headers: _headers,
            });
        } else {
            res = await fetch(encodeUrlHeaders(mediaSource.url, _headers));
        }

        const totalSize = +res.headers.get("content-length");
        onStateChange({
            state,
            downloaded: 0,
            total: totalSize,
        });

        await new Promise<void>((resolve, reject) => {
            const stm = responseToReadable(res, {
                onRead(size) {
                    if (state !== DownloadState.DOWNLOADING || hasError) {
                        return;
                    }
                    state = DownloadState.DOWNLOADING;
                    onStateChange({
                        state,
                        downloaded: size,
                        total: totalSize,
                    });
                },
                onError: (e) => {
                    if (hasError) return;
                    hasError = true;
                    state = DownloadState.ERROR;
                    onStateChange({
                        state,
                        msg: e?.message,
                    });
                    reject(e);
                },
            }).pipe(fs.createWriteStream(filePath));

            let resolved = false;
            const handleComplete = () => {
                if (resolved || hasError) return;
                resolved = true;
                state = DownloadState.DONE;
                onStateChange({
                    state,
                });
                resolve();
            };

            stm.on("finish", handleComplete);

            stm.on("error", (e) => {
                if (hasError) return;
                hasError = true;
                state = DownloadState.ERROR;
                onStateChange({
                    state,
                    msg: e?.message,
                });
                cleanFile(filePath);
                reject(e);
            });
        });
    } catch (e) {
        if (!hasError) {
            hasError = true;
            state = DownloadState.ERROR;
            onStateChange({
                state,
                msg: e?.message,
            });
        }
        cleanFile(filePath);
    }
}


interface IOptions {
    onProgress?: (progress: ICommon.IDownloadFileSize) => Promise<void>;
    onEnded?: () => Promise<void>;
    onError?: (reason: Error) => Promise<void>;
}
async function downloadFileNew(
    mediaSource: IMusic.IMusicSource,
    filePath: string,
    options?: IOptions,
) {
    let hasError = false;
    const { onProgress: onProgressCallback, onEnded: onEndedCallback, onError: onErrorCallback } = options ?? {};
    
    try {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            hasError = true;
            onErrorCallback?.(new Error("Filepath is a directory"));
            return;
        }
    } catch (e) {
    // pass
    }

    const headers: Record<string, string> = {
        ...(mediaSource.headers ?? {}),
        "user-agent": mediaSource.userAgent,
    };

    try {
        const urlObj = new URL(mediaSource.url);
        let res: Response;
        if (urlObj.username && urlObj.password) {
            headers["Authorization"] = `Basic ${btoa(
                `${decodeURIComponent(urlObj.username)}:${decodeURIComponent(
                    urlObj.password,
                )}`,
            )}`;
            urlObj.username = "";
            urlObj.password = "";
            res = await fetch(urlObj.toString(), {
                headers: headers,
            });
        } else {
            res = await fetch(encodeUrlHeaders(mediaSource.url, headers));
        }

        const totalSize = +res.headers.get("content-length");
        onProgressCallback?.({
            currentSize: 0,
            totalSize: totalSize,
        });

        await new Promise<void>((resolve, reject) => {
            const stm = responseToReadable(res, {
                onRead(size) {
                    if (hasError) {
                        return;
                    }
                    onProgressCallback?.({
                        currentSize: size,
                        totalSize: totalSize,
                    });
                },
                onError: (e) => {
                    if (!hasError) {
                        hasError = true;
                        onErrorCallback?.(e);
                        reject(e);
                    }
                },
            }).pipe(fs.createWriteStream(filePath));

            let resolved = false;
            const handleComplete = async () => {
                if (resolved) return;
                resolved = true;
                try {
                    await onEndedCallback?.();
                } catch (e) {
                    // ignore
                }
                resolve();
            };

            stm.on("finish", handleComplete);
            stm.on("close", handleComplete);

            stm.on("error", (e) => {
                if (!hasError) {
                    hasError = true;
                    onErrorCallback?.(e);
                    reject(e);
                }
                cleanFile(filePath);
            });
        });
    } catch (e) {
        if (!hasError) {
            hasError = true;
            onErrorCallback?.(e);
        }
        cleanFile(filePath);
    }
}



Comlink.expose({
    downloadFile,
    downloadFileNew,
});
