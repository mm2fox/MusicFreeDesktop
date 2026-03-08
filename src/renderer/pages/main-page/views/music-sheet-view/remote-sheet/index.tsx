import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import usePluginSheetMusicList from "./hooks/usePluginSheetMusicList";
import MusicSheetlikeView from "@/renderer/components/MusicSheetlikeView";
import { isSameMedia } from "@/common/media-util";

import MusicSheet from "@/renderer/core/music-sheet";
import { useTranslation } from "react-i18next";
import SvgAsset from "@/renderer/components/SvgAsset";
import remoteSheetInfoStore from "@/renderer/core/remote-sheet-info/store";
import currentListSourceStore from "@/renderer/core/current-list-source/store";

export default function RemoteSheet() {
    const { platform, id } = useParams() ?? {};

    const savedSheetInfo = remoteSheetInfoStore.useValue();
    const initialSheetItem = history.state?.usr?.sheetItem ?? 
        (savedSheetInfo?.platform === platform && savedSheetInfo?.id === id 
            ? savedSheetInfo.sheetItem 
            : null);

    const [state, sheetItem, musicList, getSheetDetail] = usePluginSheetMusicList(
        platform,
        id,
        initialSheetItem,
    );

    useEffect(() => {
        if (platform && id) {
            currentListSourceStore.setValue({
                type: "music-sheet",
                path: `/main/musicsheet/${encodeURIComponent(platform)}/${encodeURIComponent(id)}`,
                title: sheetItem?.title,
            });
        }
    }, [platform, id, sheetItem?.title]);

    useEffect(() => {
        if (platform && id && sheetItem) {
            remoteSheetInfoStore.setValue({
                platform,
                id,
                sheetItem,
            });
        }
    }, [platform, id, sheetItem]);

    return (
        <MusicSheetlikeView
            musicSheet={sheetItem}
            musicList={musicList}
            state={state}
            onLoadMore={() => {
                getSheetDetail();
            }}
            options={<RemoteSheetOptions sheetItem={sheetItem}></RemoteSheetOptions>}
        />
    );
}

interface IProps {
    sheetItem: IMusic.IMusicSheetItem;
}
function RemoteSheetOptions(props: IProps) {
    const { sheetItem } = props;
    const starredMusicSheets = MusicSheet.frontend.useAllStarredSheets();
    const { t } = useTranslation();

    const isStarred = starredMusicSheets.find((item) =>
        isSameMedia(sheetItem, item),
    );

    return (
        <>
            <div
                role="button"
                className="option-button"
                data-type="normalButton"
                onClick={() => {
                    if (isStarred) {
                        MusicSheet.frontend.unstarMusicSheet(sheetItem);
                    } else {
                        MusicSheet.frontend.starMusicSheet(sheetItem);
                    }
                }}
            >
                <SvgAsset
                    iconName={isStarred ? "heart" : "heart-outline"}
                    color={isStarred ? "red" : undefined}
                ></SvgAsset>
                <span>{t("music_sheet_like_view.star")}</span>
            </div>
        </>
    );
}
