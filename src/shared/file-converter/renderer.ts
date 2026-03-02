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

interface IMod {
    convert: (options: ConvertOptions) => Promise<ConvertResult>;
    convertBatch: (optionsList: ConvertOptions[]) => Promise<ConvertResult[]>;
    cancelConversion: (convertId: string) => Promise<boolean>;
    checkFfmpeg: () => Promise<{ available: boolean; path?: string; error?: string }>;
    selectOutputDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
    getSupportedFormats: () => Promise<{ input: string[]; output: string[] }>;
    onProgress: (callback: (progress: ConvertProgress) => void) => () => void;
    onBatchProgress: (callback: (progress: BatchProgress) => void) => () => void;
}

const mod = window["@shared/file-converter" as any] as unknown as IMod;

const FileConverter = {
    convert: mod?.convert ?? (async () => ({ success: false, error: "FileConverter not available" })),
    convertBatch: mod?.convertBatch ?? (async () => []),
    cancelConversion: mod?.cancelConversion ?? (async () => false),
    checkFfmpeg: mod?.checkFfmpeg ?? (async () => ({ available: false, error: "FileConverter not available" })),
    selectOutputDir: mod?.selectOutputDir ?? (async () => ({ success: false })),
    getSupportedFormats: mod?.getSupportedFormats ?? (async () => ({ input: [], output: [] })),
    onProgress: mod?.onProgress ?? (() => () => undefined),
    onBatchProgress: mod?.onBatchProgress ?? (() => () => undefined),
};

export default FileConverter;

export type { ConvertOptions, ConvertResult, ConvertProgress, BatchProgress };
