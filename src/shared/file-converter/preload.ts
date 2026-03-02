import { contextBridge, ipcRenderer } from "electron";

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
    inputPath: string;
    percent: number;
    currentTime: number;
    totalDuration: number;
}

interface BatchProgress {
    current: number;
    total: number;
    currentInput: string;
}

async function convert(options: ConvertOptions): Promise<ConvertResult> {
    return await ipcRenderer.invoke("@shared/file-converter/convert", options);
}

async function convertBatch(optionsList: ConvertOptions[]): Promise<ConvertResult[]> {
    return await ipcRenderer.invoke("@shared/file-converter/convert-batch", optionsList);
}

async function cancelConversion(convertId: string): Promise<boolean> {
    return await ipcRenderer.invoke("@shared/file-converter/cancel", convertId);
}

async function checkFfmpeg(): Promise<{ available: boolean; path?: string; error?: string }> {
    return await ipcRenderer.invoke("@shared/file-converter/check-ffmpeg");
}

async function selectOutputDir(): Promise<{ success: boolean; path?: string; error?: string }> {
    return await ipcRenderer.invoke("@shared/file-converter/select-output-dir");
}

async function getSupportedFormats(): Promise<{ input: string[]; output: string[] }> {
    return await ipcRenderer.invoke("@shared/file-converter/get-supported-formats");
}

function onProgress(callback: (progress: ConvertProgress) => void) {
    const handler = (_: any, progress: ConvertProgress) => callback(progress);
    ipcRenderer.on("@shared/file-converter/progress", handler);
    return () => ipcRenderer.removeListener("@shared/file-converter/progress", handler);
}

function onBatchProgress(callback: (progress: BatchProgress) => void) {
    const handler = (_: any, progress: BatchProgress) => callback(progress);
    ipcRenderer.on("@shared/file-converter/batch-progress", handler);
    return () => ipcRenderer.removeListener("@shared/file-converter/batch-progress", handler);
}

const mod = {
    convert,
    convertBatch,
    cancelConversion,
    checkFfmpeg,
    selectOutputDir,
    getSupportedFormats,
    onProgress,
    onBatchProgress,
};

contextBridge.exposeInMainWorld("@shared/file-converter", mod);
