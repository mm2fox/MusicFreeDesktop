import { useParams } from "react-router-dom";
import Header from "./components/Header";
import "./index.scss";
import { useEffect, useMemo } from "react";
import Body from "./components/Body";
import { initQueryResult, queryResultStore } from "./store";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import remoteSheetInfoStore from "@/renderer/core/remote-sheet-info/store";

export default function ArtistView() {
    const params = useParams();
    const platform = params?.platform;
    const id = params?.id;

    const savedSheetInfo = remoteSheetInfoStore.useValue();

    const artistItem = useMemo(() => {
        const artistInState = history.state.usr?.artistItem ?? 
            (savedSheetInfo?.platform === platform && savedSheetInfo?.id === id 
                ? savedSheetInfo.sheetItem 
                : {});

        return {
            ...artistInState,
            platform,
            id,
        } as IArtist.IArtistItem;
    }, [platform, id, savedSheetInfo]);

    useEffect(() => {
        if (platform && id) {
            currentListSourceStore.setValue({
                type: "music-sheet",
                path: `/main/artist/${encodeURIComponent(platform)}/${encodeURIComponent(id)}`,
                title: artistItem?.name,
            });
        }
    }, [platform, id, artistItem?.name]);

    useEffect(() => {
        if (platform && id && artistItem) {
            remoteSheetInfoStore.setValue({
                platform,
                id,
                sheetItem: {
                    ...artistItem,
                    title: artistItem.name,
                } as IMusic.IMusicSheetItem,
            });
        }
    }, [platform, id, artistItem]);

    useEffect(() => {
        return () => {
            queryResultStore.setValue(initQueryResult);
        };
    });

    return (
        <div id="page-container" className="page-container artist-view--container">
            <Header artistItem={artistItem}></Header>
            <Body artistItem={artistItem}></Body>
        </div>
    );
}
