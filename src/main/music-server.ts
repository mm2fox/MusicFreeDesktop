import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import logger from "@shared/logger/main";

interface PlaySession {
    id: string;
    filePath: string;
    fileSize: number;
    contentType: string;
    isPaused: boolean;
    currentPosition: number;
    response: http.ServerResponse | null;
    readStream: fs.ReadStream | null;
}

export class MusicServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private hostname: string = "0.0.0.0";
    private sessions: Map<string, PlaySession> = new Map();
    private currentSessionId: string | null = null;

    async start(port: number = 0): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(port, this.hostname, () => {
                const address = this.server?.address();
                if (address && typeof address === "object") {
                    this.port = address.port;
                    logger.logInfo("音乐服务器启动成功", { port: this.port });
                    resolve(this.port);
                } else {
                    reject(new Error("无法获取服务器地址"));
                }
            });

            this.server.on("error", (error) => {
                logger.logError("音乐服务器错误", error);
                reject(error);
            });
        });
    }

    async stop(): Promise<void> {
        this.stopAllSessions();
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.logInfo("音乐服务器已停止");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getServerUrl(): string {
        const ip = this.getLocalIpAddress();
        return `http://${ip}:${this.port}`;
    }

    isRunning(): boolean {
        return this.server !== null && this.port > 0;
    }

    private getLocalIpAddress(): string {
        const interfaces = require("os").networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === "IPv4" && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return "127.0.0.1";
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        try {
            const parsedUrl = url.parse(req.url || "", true);
            const pathname = parsedUrl.pathname || "";

            logger.logInfo("音乐服务器收到请求", { method: req.method, path: pathname });

            if (pathname.startsWith("/stream/")) {
                const sessionId = pathname.slice("/stream/".length);
                this.handleStreamRequest(sessionId, req, res);
                return;
            }

            if (pathname === "/control/pause") {
                const sessionId = parsedUrl.query.sessionId as string;
                this.pauseSession(sessionId);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
                return;
            }

            if (pathname === "/control/resume") {
                const sessionId = parsedUrl.query.sessionId as string;
                this.resumeSession(sessionId);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
                return;
            }

            if (pathname === "/control/seek") {
                const sessionId = parsedUrl.query.sessionId as string;
                const position = parseInt(parsedUrl.query.position as string || "0", 10);
                this.seekSession(sessionId, position);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
                return;
            }

            if (pathname === "/control/stop") {
                const sessionId = parsedUrl.query.sessionId as string;
                this.stopSession(sessionId);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
                return;
            }

            if (pathname.startsWith("/music/")) {
                const encodedPath = pathname.slice("/music/".length);
                const filePath = decodeURIComponent(encodedPath);
                this.serveMusicFile(filePath, res);
                return;
            }

            if (pathname === "/proxy") {
                const targetUrl = parsedUrl.query.url as string;
                if (targetUrl) {
                    const decodedUrl = decodeURIComponent(targetUrl);
                    if (decodedUrl.startsWith("file://")) {
                        this.serveNetworkFile(decodedUrl, res);
                    } else {
                        this.proxyAudioStream(decodedUrl, res, req);
                    }
                } else {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("Missing url parameter");
                }
                return;
            }

            if (pathname === "/health") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "ok", port: this.port }));
                return;
            }

            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        } catch (error) {
            logger.logError("处理请求失败", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
        }
    }

    createStreamSession(fileUrl: string): string | null {
        try {
            logger.logInfo(`createStreamSession 被调用: ${fileUrl}`);
            
            let filePath: string;
            if (fileUrl.startsWith("file://")) {
                // 先去掉 file:// 前缀
                filePath = fileUrl.slice("file://".length);
                // 解码 URL 编码
                filePath = decodeURIComponent(filePath);
                // 将 / 替换为 \
                filePath = filePath.replace(/\//g, "\\");
                // 确保是 UNC 路径
                if (!filePath.startsWith("\\\\")) {
                    filePath = "\\\\" + filePath;
                }
            } else {
                filePath = fileUrl;
            }

            logger.logInfo(`转换后的文件路径: ${filePath}`);

            // 检查文件是否存在
            let fileExists = false;
            try {
                fileExists = fs.existsSync(filePath);
            } catch (e) {
                logger.logError("检查文件存在失败", e as Error);
            }

            if (!fileExists) {
                logger.logError("文件不存在", new Error(`File not found: ${filePath}`));
                // 即使文件不存在也创建会话，让音箱尝试访问
            }

            // 如果文件存在，获取文件大小；否则使用 0
            let fileSize = 0;
            let isFile = true;
            if (fileExists) {
                try {
                    const stat = fs.statSync(filePath);
                    fileSize = stat.size;
                    isFile = stat.isFile();
                } catch (e) {
                    logger.logError("获取文件信息失败", e as Error);
                }
            }

            if (!isFile) {
                logger.logError("不是文件", new Error(`Not a file: ${filePath}`));
                return null;
            }

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".wav": "audio/wav",
                ".aac": "audio/aac",
                ".ogg": "audio/ogg",
                ".m4a": "audio/mp4",
            };
            const contentType = mimeTypes[ext] || "application/octet-stream";

            const sessionId = this.generateSessionId();
            const session: PlaySession = {
                id: sessionId,
                filePath,
                fileSize,
                contentType,
                isPaused: false,
                currentPosition: 0,
                response: null,
                readStream: null,
            };

            this.sessions.set(sessionId, session);
            this.currentSessionId = sessionId;

            logger.logInfo("创建播放会话成功", { sessionId, filePath, fileSize });
            return sessionId;
        } catch (error) {
            logger.logError("创建播放会话失败", error);
            return null;
        }
    }

    getStreamUrl(sessionId: string): string {
        return `${this.getServerUrl()}/stream/${sessionId}`;
    }

    private handleStreamRequest(sessionId: string, req: http.IncomingMessage, res: http.ServerResponse): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Session not found");
            return;
        }

        // 优先使用会话中保存的位置
        let startByte = session.currentPosition;
        
        // 如果会话位置为 0，检查 Range 请求
        if (startByte === 0) {
            const range = req.headers.range;
            if (range) {
                const bytesPrefix = "bytes=";
                if (range.startsWith(bytesPrefix)) {
                    const rangeValue = range.slice(bytesPrefix.length);
                    const rangeParts = rangeValue.split("-");
                    if (rangeParts[0]) {
                        startByte = parseInt(rangeParts[0], 10);
                    }
                }
            }
        }

        startByte = Math.max(0, Math.min(startByte, session.fileSize - 1));

        session.currentPosition = startByte;
        session.response = res;
        session.isPaused = false;

        const contentLength = session.fileSize - startByte;

        logger.logInfo(`处理流请求: sessionId=${sessionId}, startByte=${startByte}, contentLength=${contentLength}`);

        res.writeHead(206, {
            "Content-Type": session.contentType,
            "Content-Length": contentLength,
            "Content-Range": `bytes ${startByte}-${session.fileSize - 1}/${session.fileSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        });

        this.startStreaming(session);
    }

    private startStreaming(session: PlaySession): void {
        if (session.readStream) {
            session.readStream.destroy();
        }

        session.readStream = fs.createReadStream(session.filePath, {
            start: session.currentPosition,
            highWaterMark: 64 * 1024,
        });

        session.readStream.on("data", (chunk: Buffer) => {
            if (session.isPaused) {
                session.readStream?.pause();
                return;
            }

            if (!session.response || session.response.writableEnded) {
                session.readStream?.destroy();
                return;
            }

            const canContinue = session.response.write(chunk);
            session.currentPosition += chunk.length;

            if (!canContinue) {
                session.readStream?.pause();
                session.response.once("drain", () => {
                    if (!session.isPaused && session.readStream) {
                        session.readStream.resume();
                    }
                });
            }
        });

        session.readStream.on("end", () => {
            logger.logInfo("流传输完成", { sessionId: session.id });
            if (session.response && !session.response.writableEnded) {
                session.response.end();
            }
        });

        session.readStream.on("error", (error) => {
            logger.logError("流传输错误", error, { sessionId: session.id });
            if (session.response && !session.response.writableEnded) {
                session.response.end();
            }
        });
    }

    pauseSession(sessionId: string | undefined): void {
        if (!sessionId) sessionId = this.currentSessionId || undefined;
        if (!sessionId) return;

        const session = this.sessions.get(sessionId);
        if (session) {
            session.isPaused = true;
            if (session.readStream) {
                session.readStream.pause();
            }
            logger.logInfo("暂停播放", { sessionId });
        }
    }

    resumeSession(sessionId: string | undefined): void {
        if (!sessionId) sessionId = this.currentSessionId || undefined;
        if (!sessionId) return;

        const session = this.sessions.get(sessionId);
        if (session) {
            session.isPaused = false;
            if (session.readStream) {
                session.readStream.resume();
            }
            logger.logInfo("恢复播放", { sessionId });
        }
    }

    seekSession(sessionId: string | undefined, position: number): void {
        if (!sessionId) sessionId = this.currentSessionId || undefined;
        if (!sessionId) return;

        const session = this.sessions.get(sessionId);
        if (session) {
            position = Math.max(0, Math.min(position, session.fileSize - 1));
            
            if (session.readStream) {
                session.readStream.destroy();
                session.readStream = null;
            }

            session.currentPosition = position;
            session.isPaused = false;

            if (session.response && !session.response.writableEnded) {
                const contentLength = session.fileSize - position;
                session.response.writeHead(206, {
                    "Content-Type": session.contentType,
                    "Content-Length": contentLength,
                    "Content-Range": `bytes ${position}-${session.fileSize - 1}/${session.fileSize}`,
                    "Accept-Ranges": "bytes",
                });
                this.startStreaming(session);
            }

            logger.logInfo("跳转播放位置", { sessionId, position });
        }
    }

    setSessionStartPosition(sessionId: string | undefined, position: number): void {
        if (!sessionId) sessionId = this.currentSessionId || undefined;
        if (!sessionId) return;

        const session = this.sessions.get(sessionId);
        if (session) {
            position = Math.max(0, Math.min(position, session.fileSize - 1));
            session.currentPosition = position;
            logger.logInfo("设置会话起始位置", { sessionId, position });
        }
    }

    stopSession(sessionId: string | undefined): void {
        if (!sessionId) sessionId = this.currentSessionId || undefined;
        if (!sessionId) return;

        const session = this.sessions.get(sessionId);
        if (session) {
            if (session.readStream) {
                session.readStream.destroy();
                session.readStream = null;
            }
            if (session.response && !session.response.writableEnded) {
                session.response.end();
            }
            session.response = null;
            logger.logInfo("停止播放", { sessionId });
        }
    }

    private stopAllSessions(): void {
        for (const [sessionId, session] of this.sessions) {
            if (session.readStream) {
                session.readStream.destroy();
            }
            if (session.response && !session.response.writableEnded) {
                session.response.end();
            }
        }
        this.sessions.clear();
        this.currentSessionId = null;
    }

    private generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    private serveMusicFile(filePath: string, res: http.ServerResponse): void {
        try {
            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("File Not Found");
                return;
            }

            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Not a file");
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".wav": "audio/wav",
                ".aac": "audio/aac",
                ".ogg": "audio/ogg",
                ".m4a": "audio/mp4",
            };
            const contentType = mimeTypes[ext] || "application/octet-stream";

            const headers: Record<string, string> = {
                "Content-Type": contentType,
                "Content-Length": stat.size.toString(),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            };

            res.writeHead(200, headers);
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);

            stream.on("error", (error) => {
                logger.logError("读取文件失败", error, { filePath });
            });
        } catch (error) {
            logger.logError("提供音乐文件失败", error as Error, { filePath });
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
        }
    }

    private serveNetworkFile(fileUrl: string, res: http.ServerResponse): void {
        try {
            let filePath: string;
            if (fileUrl.startsWith("file://")) {
                // 先去掉 file:// 前缀
                filePath = fileUrl.slice("file://".length);
                // 解码 URL 编码
                filePath = decodeURIComponent(filePath);
                // 将 / 替换为 \
                filePath = filePath.replace(/\//g, "\\");
                // 确保是 UNC 路径
                if (!filePath.startsWith("\\\\")) {
                    filePath = "\\\\" + filePath;
                }
            } else {
                filePath = fileUrl;
            }

            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("File Not Found");
                return;
            }

            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Not a file");
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".wav": "audio/wav",
                ".aac": "audio/aac",
                ".ogg": "audio/ogg",
                ".m4a": "audio/mp4",
            };
            const contentType = mimeTypes[ext] || "application/octet-stream";

            const headers: Record<string, string> = {
                "Content-Type": contentType,
                "Content-Length": stat.size.toString(),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            };

            res.writeHead(200, headers);
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);

            stream.on("error", (error) => {
                logger.logError("读取网络文件失败", error, { filePath });
            });
        } catch (error) {
            logger.logError("提供网络文件失败", error as Error, { fileUrl });
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error: " + (error as Error).message);
        }
    }

    getMusicUrl(filePath: string): string {
        const encodedPath = encodeURIComponent(filePath);
        return `${this.getServerUrl()}/music/${encodedPath}`;
    }

    getProxyUrl(audioUrl: string): string {
        const encodedUrl = encodeURIComponent(audioUrl);
        return `${this.getServerUrl()}/proxy?url=${encodedUrl}`;
    }

    private async proxyAudioStream(targetUrl: string, res: http.ServerResponse, req: http.IncomingMessage): Promise<void> {
        try {
            const parsedTarget = new URL(targetUrl);
            const isHttps = parsedTarget.protocol === "https:";
            const httpModule = isHttps ? https : http;

            const headers: Record<string, string> = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "*/*",
                "Referer": `${parsedTarget.protocol}//${parsedTarget.host}/`,
            };

            const range = req.headers.range;
            if (range) {
                headers["Range"] = range;
            }

            const proxyReq = httpModule.request(targetUrl, {
                method: "GET",
                headers: headers,
            }, (proxyRes) => {
                const statusCode = proxyRes.statusCode || 200;
                const responseHeaders = proxyRes.headers;

                const resHeaders: Record<string, string | number | string[] | undefined> = {
                    "Content-Type": responseHeaders["content-type"] || "audio/mpeg",
                    "Accept-Ranges": responseHeaders["accept-ranges"] || "bytes",
                    "Access-Control-Allow-Origin": "*",
                };

                if (responseHeaders["content-length"]) {
                    resHeaders["Content-Length"] = responseHeaders["content-length"];
                }
                if (responseHeaders["content-range"]) {
                    resHeaders["Content-Range"] = responseHeaders["content-range"];
                }

                res.writeHead(statusCode, resHeaders);
                proxyRes.pipe(res);
            });

            proxyReq.on("error", (error) => {
                logger.logError("代理请求失败", error, { url: targetUrl });
                if (!res.headersSent) {
                    res.writeHead(502, { "Content-Type": "text/plain" });
                    res.end("Proxy Error: " + error.message);
                }
            });

            proxyReq.setTimeout(30000, () => {
                proxyReq.destroy();
                if (!res.headersSent) {
                    res.writeHead(504, { "Content-Type": "text/plain" });
                    res.end("Gateway Timeout");
                }
            });

            proxyReq.end();
        } catch (error) {
            logger.logError("代理音频失败", error as Error, { url: targetUrl });
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Internal Server Error");
            }
        }
    }
}

export const musicServer = new MusicServer();
