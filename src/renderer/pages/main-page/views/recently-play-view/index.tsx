import SvgAsset from "@/renderer/components/SvgAsset";
import {
    clearRecentlyPlaylist,
    useRecentlyPlaylistSheet,
    useRecentlyPlaylistWithTime,
} from "@/renderer/core/recently-playlist";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import GroupedMusicList from "@/renderer/components/GroupedMusicList";
import trackPlayer from "@renderer/core/track-player";
import { showModal } from "@/renderer/components/Modal";

export default function RecentlyPlayView() {
    const recentlyPlaylistSheet = useRecentlyPlaylistSheet();
    const recentlyPlaylistWithTime = useRecentlyPlaylistWithTime();
    const { t } = useTranslation();
    const [inputSearch, setInputSearch] = useState("");
    const [filterMusicList, setFilterMusicList] = useState<
        Array<IMusic.IMusicItem & { $$playTime?: number }> | null
    >(null);

    useEffect(() => {
        currentListSourceStore.setValue({
            type: "recently-play",
            path: "/main/recently-play",
        });
    }, []);

    useEffect(() => {
        if (inputSearch.trim() === "") {
            setFilterMusicList(null);
        } else {
            const searchText = inputSearch.toLocaleLowerCase();
            setFilterMusicList(
                recentlyPlaylistWithTime?.filter(
                    (item) =>
                        item.title?.toLocaleLowerCase()?.includes(searchText) ||
                        item.artist?.toLocaleLowerCase()?.includes(searchText) ||
                        item.album?.toLocaleLowerCase()?.includes(searchText),
                ) || [],
            );
        }
    }, [inputSearch, recentlyPlaylistWithTime]);

    const options = (
        <>
            <div
                role="button"
                className="option-button"
                data-type="normalButton"
                data-disabled={!recentlyPlaylistSheet.playCount}
                onClick={() => {
                    clearRecentlyPlaylist();
                }}
            >
                <SvgAsset iconName={"trash"}></SvgAsset>
                <span>{t("common.clear")}</span>
            </div>
        </>
    );

    const displayMusicList = filterMusicList ?? recentlyPlaylistWithTime ?? [];

    return (
        <div id="page-container" className="page-container">
            <div className="music-sheetlike-view--container">
                <div className="music-sheetlike-view--header-container">
                    <div className="header-info">
                        <div className="header-title">
                            {recentlyPlaylistSheet.title}
                        </div>
                        <div className="header-info-row">
                            <span>
                                {t("media.media_music_count")}: {recentlyPlaylistSheet.playCount}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="music-sheetlike-view--body-container">
                    <div className="operations">
                        <div className="buttons">
                            <div
                                role="button"
                                className="option-button"
                                data-disabled={!displayMusicList?.length}
                                data-type="primaryButton"
                                title={t("music_sheet_like_view.play_all")}
                                onClick={() => {
                                    if (displayMusicList.length) {
                                        trackPlayer.playMusicWithReplaceQueue(displayMusicList);
                                    }
                                }}
                            >
                                <SvgAsset iconName="play"></SvgAsset>
                                <span>{t("music_sheet_like_view.play_all")}</span>
                            </div>
                            <div
                                role="button"
                                data-type="normalButton"
                                data-disabled={!displayMusicList?.length}
                                className="add-to-sheet option-button"
                                title={t("music_sheet_like_view.add_to_sheet")}
                                onClick={() => {
                                    showModal("AddMusicToSheet", {
                                        musicItems: displayMusicList,
                                    });
                                }}
                            >
                                <SvgAsset iconName="plus"></SvgAsset>
                                <span>{t("music_sheet_like_view.add_to_sheet")}</span>
                            </div>
                            {options}
                        </div>
                        <div className="search-in-music-list-container">
                            <input
                                spellCheck={false}
                                onChange={(evt) => {
                                    setInputSearch(evt.target.value);
                                }}
                                value={inputSearch}
                                className="search-in-music-list"
                                placeholder={t("recently_play.search_placeholder")}
                            ></input>
                            <SvgAsset iconName="magnifying-glass"></SvgAsset>
                        </div>
                    </div>
                    <GroupedMusicList
                        musicList={displayMusicList}
                        musicSheet={recentlyPlaylistSheet}
                    />
                </div>
            </div>
        </div>
    );
}
