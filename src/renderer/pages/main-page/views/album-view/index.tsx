import MusicSheetlikeView from "@/renderer/components/MusicSheetlikeView";
import { useParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import "./index.scss";
import useAlbumDetail from "./hooks/useAlbumDetail";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import remoteSheetInfoStore from "@/renderer/core/remote-sheet-info/store";

export default function AlbumView() {
    const params = useParams();
    const platform = params?.platform;
    const id = params?.id;

    const savedSheetInfo = remoteSheetInfoStore.useValue();
    
    const originalAlbumItem = useMemo(() => {
        const sheetInState = history.state.usr?.albumItem ?? 
            (savedSheetInfo?.platform === platform && savedSheetInfo?.id === id 
                ? savedSheetInfo.sheetItem 
                : {});

        return {
            ...sheetInState,
            platform,
            id,
        } as IAlbum.IAlbumItem;
    }, [platform, id, savedSheetInfo]);

    const [requestState, albumItem, musicList, getAlbumDetail] =
    useAlbumDetail(originalAlbumItem);

    useEffect(() => {
        if (platform && id) {
            currentListSourceStore.setValue({
                type: "music-sheet",
                path: `/main/album/${encodeURIComponent(platform)}/${encodeURIComponent(id)}`,
                title: albumItem?.title,
            });
        }
    }, [platform, id, albumItem?.title]);

    useEffect(() => {
        if (platform && id && albumItem) {
            remoteSheetInfoStore.setValue({
                platform,
                id,
                sheetItem: albumItem,
            });
        }
    }, [platform, id, albumItem]);

    return (
        <div id="page-container" className="page-container">
            <MusicSheetlikeView
                musicSheet={albumItem}
                musicList={musicList}
                onLoadMore={getAlbumDetail}
                state={requestState}
            ></MusicSheetlikeView>
        </div>
    );
}
