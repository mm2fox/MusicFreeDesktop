import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import albumImg from "@/assets/imgs/album-cover.jpg";
import SvgAsset from "@/renderer/components/SvgAsset";
import MusicSearch from "@/shared/music-search/renderer";
import { useEffect, useState, useCallback } from "react";
import { shellUtil } from "@shared/utils/renderer";

interface IMusicInfoModalProps {
    musicItem: IMusic.IMusicItem;
}

interface ISearchResult {
    title: string;
    snippet: string;
    url: string;
}

interface ICategoryResult {
    key: string;
    label: string;
    query: string;
    searchUrl: string;
    results: ISearchResult[];
    loading: boolean;
}

export default function MusicInfoModal(props: IMusicInfoModalProps) {
    const { musicItem } = props;
    const { t } = useTranslation();

    const [searchEngine, setSearchEngine] = useState<"baidu" | "bing">("baidu");
    const [categories, setCategories] = useState<ICategoryResult[]>([]);

    const getSearchUrl = useCallback((query: string, engine: "baidu" | "bing"): string => {
        if (engine === "bing") {
            return `https://cn.bing.com/search?q=${encodeURIComponent(query)}`;
        }
        return `https://www.baidu.com/s?tn=68018901_7_oem_dg&ie=utf-8&wd=${encodeURIComponent(query)}`;
    }, []);

    const initCategories = useCallback(async () => {
        const engine = await MusicSearch.getSearchEngine();
        setSearchEngine(engine);

        const cats: ICategoryResult[] = [];

        const titleQuery = `${musicItem.title} 歌曲`;
        cats.push({
            key: "title",
            label: t("music_info.search_by_title"),
            query: titleQuery,
            searchUrl: getSearchUrl(titleQuery, engine),
            results: [],
            loading: true,
        });

        const artistValue = musicItem.artist?.trim();
        if (artistValue && artistValue !== t("media.unknown_artist")) {
            const artistQuery = musicItem.artist;
            cats.push({
                key: "artist",
                label: t("music_info.search_by_artist", { artist: musicItem.artist }),
                query: artistQuery,
                searchUrl: getSearchUrl(artistQuery, engine),
                results: [],
                loading: true,
            });
        }

        const albumValue = musicItem.album?.trim();
        if (albumValue && albumValue !== t("media.unknown_album")) {
            const albumQuery = `${musicItem.album} 专辑`;
            cats.push({
                key: "album",
                label: t("music_info.search_by_album", { album: musicItem.album }),
                query: albumQuery,
                searchUrl: getSearchUrl(albumQuery, engine),
                results: [],
                loading: true,
            });
        }

        setCategories(cats);

        cats.forEach((cat, index) => {
            MusicSearch.searchMusicInfo(cat.query).then((result) => {
                setCategories((prev) => {
                    const newCats = [...prev];
                    if (newCats[index]) {
                        newCats[index] = {
                            ...newCats[index],
                            results: result.searchResults || [],
                            loading: false,
                        };
                    }
                    return newCats;
                });
            }).catch(() => {
                setCategories((prev) => {
                    const newCats = [...prev];
                    if (newCats[index]) {
                        newCats[index] = {
                            ...newCats[index],
                            loading: false,
                        };
                    }
                    return newCats;
                });
            });
        });
    }, [musicItem, t, getSearchUrl]);

    useEffect(() => {
        initCategories();
    }, [initCategories]);

    const openUrl = (url: string) => {
        shellUtil.openExternal(url);
    };

    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    const toggleCategory = (key: string) => {
        setExpandedCategory(expandedCategory === key ? null : key);
    };

    return (
        <Base withBlur={false}>
            <div className="modal--music-info-container shadow backdrop-color">
                <Base.Header>
                    <span>{t("music_info.title")}</span>
                </Base.Header>
                <div className="music-info-content">
                    <div className="music-info-artwork">
                        <img
                            src={musicItem.artwork || albumImg}
                            onError={setFallbackAlbum}
                            alt={musicItem.title}
                        />
                    </div>
                    <div className="music-info-details">
                        <div className="info-section">
                            <h3 className="section-title">{t("music_info.basic_info")}</h3>
                            <div className="info-list">
                                <div className="info-item">
                                    <div className="info-label">
                                        <SvgAsset iconName="musical-note" size={14} />
                                        <span>{t("media.media_title")}</span>
                                    </div>
                                    <div className="info-value">{musicItem.title}</div>
                                </div>
                                <div className="info-item">
                                    <div className="info-label">
                                        <SvgAsset iconName="user" size={14} />
                                        <span>{t("media.media_type_artist")}</span>
                                    </div>
                                    <div className="info-value">{musicItem.artist || t("media.unknown_artist")}</div>
                                </div>
                                <div className="info-item">
                                    <div className="info-label">
                                        <SvgAsset iconName="album" size={14} />
                                        <span>{t("media.media_type_album")}</span>
                                    </div>
                                    <div className="info-value">{musicItem.album || t("media.unknown_album")}</div>
                                </div>
                            </div>
                        </div>

                        <div className="info-section">
                            <h3 className="section-title">{t("music_info.web_search_results")}</h3>
                            <div className="search-categories">
                                {categories.map((cat) => (
                                    <div key={cat.key} className="search-category">
                                        <div 
                                            className="category-header"
                                            onClick={() => toggleCategory(cat.key)}
                                        >
                                            <div className="category-info">
                                                <SvgAsset iconName="magnifying-glass" size={14} />
                                                <span className="category-label">{cat.label}</span>
                                            </div>
                                            <div className="category-meta">
                                                {cat.loading ? (
                                                    <SvgAsset iconName="rolling-1s" size={16} />
                                                ) : (
                                                    <>
                                                        <span className="result-count">{cat.results.length} {t("music_info.results")}</span>
                                                        <SvgAsset 
                                                            iconName={expandedCategory === cat.key ? "chevron-double-up" : "chevron-double-down"} 
                                                            size={14} 
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {expandedCategory === cat.key && !cat.loading && (
                                            <div className="category-results">
                                                <div 
                                                    className="search-engine-link"
                                                    onClick={() => openUrl(cat.searchUrl)}
                                                >
                                                    <SvgAsset iconName="magnifying-glass" size={12} />
                                                    <span>{searchEngine === "baidu" ? "百度搜索" : "必应搜索"}</span>
                                                </div>
                                                {cat.results.length > 0 ? (
                                                    cat.results.map((result, index) => (
                                                        <div 
                                                            className="result-item" 
                                                            key={index}
                                                            onClick={() => openUrl(result.url)}
                                                        >
                                                            <div className="result-title">{result.title}</div>
                                                            <div className="result-snippet">{result.snippet}</div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="no-results">{t("music_info.no_results")}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Base>
    );
}
