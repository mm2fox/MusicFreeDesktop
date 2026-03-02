import { ipcMain, dialog, BrowserWindow } from "electron";
import path from "path";
import fs from "fs/promises";
import fsCb from "fs";
import ffmpeg from "fluent-ffmpeg";
import logger from "@shared/logger/main";

interface ConvertOptions {
    inputPath: string;
    outputPath?: string;
    format: string;
    quality?: string;
}

interface ConvertResult {
    success: boolean;
    outputPath?: string;
    error?: string;
}

interface ConvertProgress {
    percent: number;
    currentTime: number;
    totalDuration: number;
}

const supportedInputFormats = [".m4s", ".mp3", ".wav", ".aac", ".ogg", ".wma", ".m4a"];
const supportedOutputFormats = ["flac", "mp3", "wav", "aac", "ogg"];

let ffmpegPath: string | null = null;
let ffprobePath: string | null = null;

function getFfmpegPath(): string | null {
    if (ffmpegPath && fsCb.existsSync(ffmpegPath)) {
        return ffmpegPath;
    }
    
    const possiblePaths = [
        path.join(process.resourcesPath, "ffmpeg", "ffmpeg.exe"),
        path.join(process.resourcesPath, "ffmpeg", "ffmpeg"),
        path.join(__dirname, "..", "..", "..", "res", "ffmpeg", "ffmpeg.exe"),
        path.join(__dirname, "..", "..", "..", "res", "ffmpeg", "ffmpeg"),
    ];
    
    for (const p of possiblePaths) {
        if (fsCb.existsSync(p)) {
            ffmpegPath = p;
            return p;
        }
    }
    
    return null;
}

function getFfprobePath(): string | null {
    if (ffprobePath && fsCb.existsSync(ffprobePath)) {
        return ffprobePath;
    }
    
    const possiblePaths = [
        path.join(process.resourcesPath, "ffmpeg", "ffprobe.exe"),
        path.join(process.resourcesPath, "ffmpeg", "ffprobe"),
        path.join(__dirname, "..", "..", "..", "res", "ffmpeg", "ffprobe.exe"),
        path.join(__dirname, "..", "..", "..", "res", "ffmpeg", "ffprobe"),
    ];
    
    for (const p of possiblePaths) {
        if (fsCb.existsSync(p)) {
            ffprobePath = p;
            return p;
        }
    }
    
    return null;
}

function setupFfmpeg(): boolean {
    const ffmpegBin = getFfmpegPath();
    const ffprobeBin = getFfprobePath();
    
    if (ffmpegBin) {
        ffmpeg.setFfmpegPath(ffmpegBin);
        logger.logInfo("FFmpeg found at:", ffmpegBin);
    } else {
        logger.logInfo("FFmpeg not found, will try system PATH");
    }
    
    if (ffprobeBin) {
        ffmpeg.setFfprobePath(ffprobeBin);
        logger.logInfo("FFprobe found at:", ffprobeBin);
    }
    
    return true;
}

class FileConverter {
    private activeConversions: Map<string, AbortController> = new Map();

    public setup() {
        setupFfmpeg();

        ipcMain.handle("@shared/file-converter/convert", async (event, options: ConvertOptions): Promise<ConvertResult> => {
            return await this.convertFile(options, event);
        });

        ipcMain.handle("@shared/file-converter/convert-batch", async (event, optionsList: ConvertOptions[]): Promise<ConvertResult[]> => {
            return await this.convertBatch(optionsList, event);
        });

        ipcMain.handle("@shared/file-converter/cancel", async (_, convertId: string) => {
            return this.cancelConversion(convertId);
        });

        ipcMain.handle("@shared/file-converter/check-ffmpeg", async () => {
            return await this.checkFfmpegAvailable();
        });

        ipcMain.handle("@shared/file-converter/select-output-dir", async () => {
            return await this.selectOutputDirectory();
        });

        ipcMain.handle("@shared/file-converter/get-supported-formats", async () => {
            return {
                input: supportedInputFormats,
                output: supportedOutputFormats,
            };
        });
    }

    private async checkFfmpegAvailable(): Promise<{ available: boolean; path?: string; error?: string }> {
        return new Promise((resolve) => {
            const ffmpegBin = getFfmpegPath();
            
            ffmpeg.getAvailableFormats((err) => {
                if (err) {
                    resolve({
                        available: false,
                        error: "FFmpeg not found. Please install FFmpeg or place ffmpeg.exe in the resources folder.",
                    });
                } else {
                    resolve({
                        available: true,
                        path: ffmpegBin || "system PATH",
                    });
                }
            });
        });
    }

    private async selectOutputDirectory(): Promise<{ success: boolean; path?: string; error?: string }> {
        const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], {
            properties: ["openDirectory", "createDirectory"],
            title: "选择输出目录",
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false };
        }

        return { success: true, path: result.filePaths[0] };
    }

    private async convertFile(options: ConvertOptions, event: Electron.IpcMainInvokeEvent): Promise<ConvertResult> {
        const { inputPath, format, quality } = options;
        let { outputPath } = options;

        try {
            const inputExists = await this.fileExists(inputPath);
            if (!inputExists) {
                return { success: false, error: `输入文件不存在: ${inputPath}` };
            }

            const inputExt = path.extname(inputPath).toLowerCase();
            if (!supportedInputFormats.includes(inputExt)) {
                return { success: false, error: `不支持的输入格式: ${inputExt}` };
            }

            if (!supportedOutputFormats.includes(format)) {
                return { success: false, error: `不支持的输出格式: ${format}` };
            }

            if (!outputPath) {
                const inputDir = path.dirname(inputPath);
                const inputBaseName = path.basename(inputPath, inputExt);
                outputPath = path.join(inputDir, `${inputBaseName}.${format}`);
            }

            const outputDir = path.dirname(outputPath);
            try {
                await fs.access(outputDir);
            } catch {
                await fs.mkdir(outputDir, { recursive: true });
            }

            return await new Promise((resolve) => {
                const convertId = `${inputPath}-${Date.now()}`;
                const abortController = new AbortController();
                this.activeConversions.set(convertId, abortController);

                let command = ffmpeg(inputPath);

                const ffmpegBin = getFfmpegPath();
                if (ffmpegBin) {
                    command = command.setFfmpegPath(ffmpegBin);
                }

                switch (format) {
                    case "flac":
                        command = command.audioCodec("flac");
                        if (quality === "original") {
                            // 保持原始采样率和位深度
                        } else {
                            command = command.audioQuality(quality === "high" ? 8 : 5);
                        }
                        break;
                    case "mp3":
                        command = command.audioCodec("libmp3lame");
                        if (quality === "original") {
                            // 保持原始比特率（VBR 质量）
                            command = command.audioQuality(2); // VBR ~190kbps
                        } else if (quality === "high") {
                            command = command.audioBitrate("320k");
                        } else if (quality === "standard") {
                            command = command.audioBitrate("192k");
                        } else {
                            command = command.audioBitrate("128k");
                        }
                        break;
                    case "wav":
                        command = command.audioCodec("pcm_s16le");
                        // WAV 是无损格式，保持原始质量
                        break;
                    case "aac":
                        command = command.audioCodec("aac");
                        if (quality === "original") {
                            command = command.audioQuality(3); // VBR ~200kbps
                        } else if (quality === "high") {
                            command = command.audioBitrate("256k");
                        } else {
                            command = command.audioBitrate("128k");
                        }
                        break;
                    case "ogg":
                        command = command.audioCodec("libvorbis");
                        if (quality === "original") {
                            command = command.audioQuality(6); // ~192kbps
                        } else {
                            command = command.audioQuality(quality === "high" ? 8 : 5);
                        }
                        break;
                }

                command
                    .on("start", (commandLine) => {
                        logger.logInfo("FFmpeg command:", commandLine);
                    })
                    .on("progress", (progress) => {
                        if (event.sender && !event.sender.isDestroyed()) {
                            event.sender.send("@shared/file-converter/progress", {
                                inputPath,
                                percent: progress.percent || 0,
                                currentTime: 0,
                                totalDuration: progress.targetSize || 0,
                            } as ConvertProgress);
                        }
                    })
                    .on("end", async () => {
                        this.activeConversions.delete(convertId);
                        
                        try {
                            const finalOutputPath = outputPath as string;
                            const outputExists = await this.fileExists(finalOutputPath);
                            if (outputExists) {
                                resolve({ success: true, outputPath });
                            } else {
                                resolve({ success: false, error: "转换完成但输出文件不存在" });
                            }
                        } catch {
                            resolve({ success: false, error: "验证输出文件失败" });
                        }
                    })
                    .on("error", (err) => {
                        this.activeConversions.delete(convertId);
                        logger.logError("FFmpeg conversion error:", err);
                        resolve({ success: false, error: err.message });
                    })
                    .save(outputPath);

                abortController.signal.addEventListener("abort", () => {
                    command.kill("SIGKILL");
                    this.activeConversions.delete(convertId);
                    resolve({ success: false, error: "转换已取消" });
                });
            });
        } catch (error: any) {
            logger.logError("File conversion error:", error);
            return { success: false, error: error?.message || "转换失败" };
        }
    }

    private async convertBatch(optionsList: ConvertOptions[], event: Electron.IpcMainInvokeEvent): Promise<ConvertResult[]> {
        const results: ConvertResult[] = [];
        const total = optionsList.length;

        for (let i = 0; i < optionsList.length; i++) {
            const options = optionsList[i];
            
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send("@shared/file-converter/batch-progress", {
                    current: i + 1,
                    total,
                    currentInput: options.inputPath,
                });
            }

            const result = await this.convertFile(options, event);
            results.push(result);
        }

        return results;
    }

    private cancelConversion(convertId: string): boolean {
        const controller = this.activeConversions.get(convertId);
        if (controller) {
            controller.abort();
            return true;
        }
        return false;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

export default new FileConverter();
