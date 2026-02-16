import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import axios from "axios";
import logger from "@shared/logger/main";

/**
 * 音乐文件 HTTP 服务器
 *
 * 类似于 xiaomusic 的 HTTP 服务器，用于提供音乐文件给小米音箱访问
 */
export class MusicServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private hostname: string = "0.0.0.0";

    /**
     * 启动 HTTP 服务器
     * @param port 端口号 (0 表示随机端口)
     * @returns 实际监听的端口号
     */
    async start(port: number = 0): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(port, this.hostname, () => {
                const address = this.server?.address();
                if (address && typeof address === "object") {
                    this.port = address.port;
                    logger.logInfo(`音乐服务器启动成功`, { port: this.port });
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

    /**
     * 停止 HTTP 服务器
     */
    async stop(): Promise<void> {
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

    /**
     * 获取服务器 URL
     */
    getServerUrl(): string {
        // 获取本机 IP 地址
        const ip = this.getLocalIpAddress();
        return `http://${ip}:${this.port}`;
    }

    /**
     * 检查服务器是否已启动
     */
    isRunning(): boolean {
        return this.server !== null && this.port > 0;
    }

    /**
     * 获取本机 IP 地址
     */
    private getLocalIpAddress(): string {
        const interfaces = require("os").networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // 跳过内部地址和非 IPv4 地址
                if (iface.family === "IPv4" && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return "127.0.0.1";
    }

    /**
     * 处理 HTTP 请求
     */
    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        try {
            const parsedUrl = url.parse(req.url || "", true);
            const pathname = parsedUrl.pathname || "";

            logger.logInfo(`音乐服务器收到请求`, { method: req.method, path: pathname });

            // 处理音乐文件请求 /music/{filepath}
            if (pathname.startsWith("/music/")) {
                const encodedPath = pathname.slice("/music/".length);
                const filePath = decodeURIComponent(encodedPath);
                this.serveMusicFile(filePath, res);
                return;
            }

            // 处理代理请求 /proxy?url={encodedUrl}
            if (pathname === "/proxy") {
                const targetUrl = parsedUrl.query.url as string;
                if (targetUrl) {
                    this.proxyAudioStream(decodeURIComponent(targetUrl), res, req);
                } else {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("Missing url parameter");
                }
                return;
            }

            // 处理健康检查
            if (pathname === "/health") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "ok", port: this.port }));
                return;
            }

            // 404
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        } catch (error) {
            logger.logError("处理请求失败", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
        }
    }

    /**
     * 提供音乐文件
     */
    private serveMusicFile(filePath: string, res: http.ServerResponse): void {
        try {
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                logger.logError(`音乐文件不存在`, new Error(`File not found: ${filePath}`));
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

            // 获取文件扩展名和 MIME 类型
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

            // 设置响应头
            const headers: Record<string, string> = {
                "Content-Type": contentType,
                "Content-Length": stat.size.toString(),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            };

            res.writeHead(200, headers);

            // 创建文件流并管道到响应
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);

            stream.on("error", (error) => {
                logger.logError(`读取文件失败`, error, { filePath });
                // 如果响应还没结束，发送错误
                if (!res.writableEnded) {
                    res.end();
                }
            });

            logger.logInfo(`正在提供音乐文件`, { filePath, size: stat.size, contentType });
        } catch (error) {
            logger.logError(`提供音乐文件失败`, error as Error, { filePath });
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
        }
    }

    /**
     * 将本地文件路径转换为可通过网络访问的 URL
     */
    getMusicUrl(filePath: string): string {
        const encodedPath = encodeURIComponent(filePath);
        return `${this.getServerUrl()}/music/${encodedPath}`;
    }

    /**
     * 将网络音频 URL 转换为代理 URL
     */
    getProxyUrl(audioUrl: string): string {
        const encodedUrl = encodeURIComponent(audioUrl);
        return `${this.getServerUrl()}/proxy?url=${encodedUrl}`;
    }

    /**
     * 代理音频流
     */
    private async proxyAudioStream(targetUrl: string, res: http.ServerResponse, req: http.IncomingMessage): Promise<void> {
        try {
            logger.logInfo(`代理音频请求`, { url: targetUrl });

            const parsedTarget = new URL(targetUrl);
            const isHttps = parsedTarget.protocol === "https:";
            const httpModule = isHttps ? https : http;

            const headers: Record<string, string> = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
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

                proxyRes.on("error", (error) => {
                    logger.logError(`代理响应流错误`, error, { url: targetUrl });
                    if (!res.writableEnded) {
                        res.end();
                    }
                });
            });

            proxyReq.on("error", (error) => {
                logger.logError(`代理请求失败`, error, { url: targetUrl });
                if (!res.headersSent) {
                    res.writeHead(502, { "Content-Type": "text/plain" });
                    res.end("Proxy Error");
                }
            });

            proxyReq.setTimeout(30000, () => {
                logger.logError(`代理请求超时`, new Error("Proxy timeout"), { url: targetUrl });
                proxyReq.destroy();
                if (!res.headersSent) {
                    res.writeHead(504, { "Content-Type": "text/plain" });
                    res.end("Gateway Timeout");
                }
            });

            proxyReq.end();
        } catch (error) {
            logger.logError(`代理音频失败`, error as Error, { url: targetUrl });
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Internal Server Error");
            }
        }
    }
}

// 导出单例
export const musicServer = new MusicServer();
