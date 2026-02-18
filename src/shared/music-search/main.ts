import { ipcMain } from "electron";
import axios from "axios";

type SearchEngine = "baidu" | "bing";

interface ISearchResult {
    title: string;
    snippet: string;
    url: string;
}

interface IMusicSearchResult {
    songInfo: {
        title?: string;
        artist?: string;
        album?: string;
        description?: string;
    };
    searchResults: ISearchResult[];
}

class MusicSearchUtil {
    private searchEngine: SearchEngine = "baidu";

    private adKeywords = [
        "广告", "推广", "赞助", "ad", "ads", "sponsored", "promotion",
        "百度为您找到", "找到相关结果约", "为您推荐", "买", "购", "优惠",
        "优惠券", "折扣", "促销", "限时", "秒杀", "特价", "包邮",
        "hao123", "hao.360", "2345", "114la", "1616", "256", "9991",
        "导航", "网址大全", "网址导航", "上网导航",
    ];

    public setup() {
        ipcMain.handle("@shared/music-search/baidu", async (_, query: string) => {
            return await this.searchBaidu(query);
        });

        ipcMain.handle("@shared/music-search/bing", async (_, query: string) => {
            return await this.searchBing(query);
        });

        ipcMain.handle("@shared/music-search/set-engine", async (_, engine: SearchEngine) => {
            this.searchEngine = engine;
            return true;
        });

        ipcMain.handle("@shared/music-search/get-engine", async () => {
            return this.searchEngine;
        });

        ipcMain.handle("@shared/music-search/baidu-music", async (_, query: string) => {
            return await this.search(query);
        });
    }

    private isAd(title: string, snippet: string): boolean {
        const text = (title + " " + snippet).toLowerCase();
        return this.adKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
    }

    private async search(query: string): Promise<IMusicSearchResult> {
        console.log("[MusicSearch] Searching for:", query, "Engine:", this.searchEngine);

        let results: ISearchResult[];
        if (this.searchEngine === "bing") {
            results = await this.searchBing(query);
        } else {
            results = await this.searchBaidu(query);
        }

        const filteredResults = results.filter((r) => !this.isAd(r.title, r.snippet));

        return {
            songInfo: {},
            searchResults: filteredResults.slice(0, 5),
        };
    }

    private async searchBaidu(query: string): Promise<ISearchResult[]> {
        try {
            const url = `https://www.baidu.com/s?tn=68018901_7_oem_dg&ie=utf-8&wd=${encodeURIComponent(query)}&rn=10`;
            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                },
                timeout: 15000,
                decompress: true,
            });

            const html = response.data;
            console.log("[MusicSearch] Baidu response length:", html?.length || 0);

            if (typeof html !== "string" || html.length < 100) {
                console.log("[MusicSearch] Baidu response too short or invalid");
                return [];
            }

            return this.parseBaiduResults(html);
        } catch (error: any) {
            console.error("[MusicSearch] Baidu search error:", error?.message || error);
            return [];
        }
    }

    private async searchBing(query: string): Promise<ISearchResult[]> {
        try {
            const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
                timeout: 15000,
            });

            const html = response.data;
            console.log("[MusicSearch] Bing response length:", html?.length || 0);
            return this.parseBingResults(html);
        } catch (error: any) {
            console.error("[MusicSearch] Bing search error:", error?.message || error);
            return [];
        }
    }

    private parseBaiduResults(html: string): ISearchResult[] {
        const results: ISearchResult[] = [];

        if (!html || typeof html !== "string") {
            return results;
        }

        try {
            const resultBlocks = html.matchAll(/<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi);

            for (const match of resultBlocks) {
                if (results.length >= 8) break;

                const block = match[1];

                const hrefMatch = block.match(/href=["'](https?:\/\/[^"']+)["']/i) ||
                    block.match(/href=["'](\/\/[^"']+)["']/i);
                if (!hrefMatch) continue;

                let url = hrefMatch[1];
                if (url.startsWith("//")) url = "https:" + url;

                if (url.includes("baidu.com/") && !url.includes("baidu.com/link")) continue;

                const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
                    block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
                if (!titleMatch) continue;

                const title = this.stripHtmlTags(titleMatch[1]).trim();
                if (!title || title.length < 2) continue;

                let snippet = "";
                const snippetMatch = block.match(/class=["']c-abstract["'][^>]*>([\s\S]*?)<\/div>/i) ||
                    block.match(/class=["']c-span[^>]*>([\s\S]*?)<\/div>/i);
                if (snippetMatch) {
                    snippet = this.stripHtmlTags(snippetMatch[1]).trim();
                }

                if (!snippet) {
                    const textParts = block.match(/>([^<]{15,200})</g);
                    if (textParts) {
                        for (const part of textParts) {
                            const text = this.stripHtmlTags(part).trim();
                            if (text.length > 15 && !text.includes("百度") && !text.includes("广告")) {
                                snippet = text;
                                break;
                            }
                        }
                    }
                }

                if (!snippet) snippet = "点击查看详情";

                results.push({
                    title,
                    snippet: snippet.substring(0, 150),
                    url,
                });
            }

            if (results.length === 0) {
                const links = html.matchAll(/<a[^>]*href=["'](https?:\/\/www\.baidu\.com\/link\?url=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);

                for (const match of links) {
                    if (results.length >= 5) break;

                    const url = match[1];
                    const title = this.stripHtmlTags(match[2]).trim();

                    if (title && title.length > 2 && !this.isAd(title, "")) {
                        results.push({
                            title,
                            snippet: "点击查看详情",
                            url,
                        });
                    }
                }
            }

            console.log("[MusicSearch] Baidu parsed results:", results.length);
        } catch (error: any) {
            console.error("[MusicSearch] Parse Baidu error:", error?.message);
        }

        return this.deduplicateResults(results);
    }

    private parseBingResults(html: string): ISearchResult[] {
        const results: ISearchResult[] = [];

        if (!html || typeof html !== "string") {
            return results;
        }

        try {
            const liMatches = html.matchAll(/<li class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi);

            for (const match of liMatches) {
                if (results.length >= 8) break;

                const liContent = match[1];

                const hrefMatch = liContent.match(/<a[^>]*href=["']([^"']+)["']/);
                if (!hrefMatch) continue;

                const url = hrefMatch[1];

                const titleMatch = liContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
                if (!titleMatch) continue;

                const title = this.stripHtmlTags(titleMatch[1]);
                if (!title || title.length < 2) continue;

                let snippet = "";
                const pMatch = liContent.match(/<p[^>]*>([\s\S]*?)<\/p>/);
                if (pMatch) {
                    snippet = this.stripHtmlTags(pMatch[1]);
                }

                if (!snippet) snippet = "点击查看详情";

                results.push({
                    title: title.trim(),
                    snippet: snippet.substring(0, 200).trim(),
                    url: url,
                });
            }
        } catch (error: any) {
            console.error("[MusicSearch] Parse Bing error:", error?.message);
        }

        return this.deduplicateResults(results);
    }

    private stripHtmlTags(html: string): string {
        if (!html) return "";
        return html
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'")
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
            .replace(/\s+/g, " ")
            .trim();
    }

    private deduplicateResults(results: ISearchResult[]): ISearchResult[] {
        const seen = new Set<string>();
        return results.filter((result) => {
            const key = result.title.toLowerCase().substring(0, 30);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
}

export default new MusicSearchUtil();
