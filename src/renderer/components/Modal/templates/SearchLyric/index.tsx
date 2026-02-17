import { useEffect, useState } from "react";
import Base from "../Base";
import "./index.scss";
import SvgAsset from "@/renderer/components/SvgAsset";
import useSearchLyric from "./hooks/useSearchLyric";
import searchResultStore from "./hooks/searchResultStore";
import { Tab } from "@headlessui/react";
import SearchResult from "./searchResult";
import { useTranslation } from "react-i18next";
import PluginManager from "@shared/plugin-manager/renderer";
import { dialogUtil, fsUtil } from "@shared/utils/renderer";
import { linkLyric } from "@/renderer/core/link-lyric";
import { toast } from "react-toastify";
import { hideModal } from "../..";
import trackPlayer from "@renderer/core/track-player";

interface IProps {
    defaultTitle?: string;
    musicItem?: IMusic.IMusicItem;
    defaultExtra?: boolean;
}

export default function SearchLyric(props: IProps) {
    const { defaultTitle, musicItem } = props;

    const [inputSearch, setInputSearch] = useState(defaultTitle ?? "");

    const searchLyric = useSearchLyric();
    const searchResults = searchResultStore.useValue();
    const { t } = useTranslation();

    const availablePlugins = PluginManager.getSearchablePlugins("lyric");

    useEffect(() => {
        if (inputSearch) {
            searchLyric(inputSearch);
        }
    }, []);

    const handleLoadLocalLyric = async () => {
        const result = await dialogUtil.showOpenDialog({
            title: t("modal.load_local_lyric"),
            filters: [
                { name: "LRC", extensions: ["lrc"] },
                { name: "TXT", extensions: ["txt"] },
            ],
            properties: ["openFile"],
        });

        if (result.canceled || !result.filePaths?.length) {
            return;
        }

        const filePath = result.filePaths[0];
        try {
            const lrcContent = await fsUtil.readFile(filePath, "utf-8");
            const fileName = filePath.split(/[/\\]/).pop() || "Local Lyric";
            const localLyricItem: ILyric.ILyricItem = {
                id: `local-${Date.now()}`,
                platform: "local",
                title: fileName.replace(/\.(lrc|txt)$/i, ""),
                artist: "",
                rawLrcTxt: lrcContent,
            };

            if (musicItem) {
                await linkLyric(musicItem, localLyricItem);
                if (trackPlayer.isCurrentMusic(musicItem)) {
                    trackPlayer.fetchCurrentLyric(true);
                }
                toast.success(t("modal.media_lyric_linked"));
                hideModal();
            }
        } catch (e) {
            toast.error(`${t("modal.media_lyric_link_failed")} ${e?.message ?? e}`);
        }
    };

    return (
        <Base defaultClose withBlur={false}>
            <div className="modal--search-lyric-container shadow backdrop-color">
                <Base.Header>
                    <div className="search-lyric-input-container">
                        <input
                            className="search-lyric-input"
                            placeholder={t("modal.search_lyric")}
                            value={inputSearch}
                            onChange={(evt) => {
                                setInputSearch(evt.target.value);
                            }}
                            onKeyDown={(key) => {
                                if (key.key === "Enter") {
                                    searchLyric(inputSearch);
                                }
                            }}
                        ></input>
                        <div
                            className="search-lyric-search"
                            role="button"
                            onClick={() => {
                                searchLyric(inputSearch);
                            }}
                        >
                            <SvgAsset iconName="magnifying-glass"></SvgAsset>
                        </div>
                    </div>
                    <div
                        className="load-local-lyric-btn"
                        role="button"
                        data-type="normalButton"
                        onClick={handleLoadLocalLyric}
                    >
                        <SvgAsset iconName="document-plus"></SvgAsset>
                        <span>{t("modal.load_local_lyric")}</span>
                    </div>
                </Base.Header>
                <Tab.Group>
                    <Tab.List className="tab-list-container">
                        {availablePlugins.map((plugin) => (
                            <Tab key={plugin.hash} as="div" className="tab-list-item">
                                {plugin.platform}
                            </Tab>
                        ))}
                    </Tab.List>
                    <Tab.Panels className={"tab-panels-container"}>
                        {availablePlugins.map((plugin) => (
                            <Tab.Panel className="tab-panel-container" key={plugin.hash}>
                                <SearchResult
                                    data={searchResults.data[plugin.hash]}
                                    musicItem={musicItem}
                                ></SearchResult>
                            </Tab.Panel>
                        ))}
                    </Tab.Panels>
                </Tab.Group>
            </div>
        </Base>
    );
}
