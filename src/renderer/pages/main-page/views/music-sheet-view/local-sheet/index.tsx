import { useParams, useSearchParams } from "react-router-dom";
import MusicSheetlikeView from "@/renderer/components/MusicSheetlikeView";
import { RequestStateCode , localPluginName } from "@/common/constant";
import MusicSheet, { defaultSheet } from "@/renderer/core/music-sheet";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { locateMusicStore } from "@/renderer/components/MusicSheetlikeView/store";
import currentListSourceStore from "@/renderer/core/current-list-source/store";


export default function LocalSheet() {
    const { id } = useParams() ?? {};
    const [musicSheet, loading] = MusicSheet.frontend.useMusicSheet(id);
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();

    const _musicSheet =
    id === defaultSheet.id
        ? {
            ...musicSheet,
            title: t("media.default_favorite_sheet_name"),
        }
        : musicSheet;

    useEffect(() => {
        const locateMusicId = searchParams.get("locateMusicId");
        const locateMusicPlatform = searchParams.get("locateMusicPlatform");
        if (locateMusicId && locateMusicPlatform) {
            locateMusicStore.setValue({
                musicId: locateMusicId,
                musicPlatform: locateMusicPlatform,
            });
        }
    }, [searchParams]);

    useEffect(() => {
        if (id) {
            currentListSourceStore.setValue({
                type: "music-sheet",
                path: `/main/musicsheet/${encodeURIComponent(localPluginName)}/${encodeURIComponent(id)}`,
                title: _musicSheet?.title,
            });
        }
    }, [id, _musicSheet?.title]);

    return (
        <MusicSheetlikeView
            hidePlatform
            musicSheet={_musicSheet}
            state={loading}
            musicList={musicSheet?.musicList ?? []}
        ></MusicSheetlikeView>
    );
}
