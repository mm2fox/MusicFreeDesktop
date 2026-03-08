import useTopListDetail from "./hooks/useTopListDetail";
import { useParams } from "react-router-dom";
import MusicSheetlikeView from "@/renderer/components/MusicSheetlikeView";
import { useEffect } from "react";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import remoteSheetInfoStore from "@/renderer/core/remote-sheet-info/store";

export default function TopListDetailView() {
    const params = useParams();
    const platform = params?.platform;
    
    const savedSheetInfo = remoteSheetInfoStore.useValue();
    const toplist = history.state?.usr?.toplist ?? 
        (savedSheetInfo?.platform === platform ? savedSheetInfo.sheetItem : null);
    
    const [topListDetail, state, loadMore] = useTopListDetail(
        toplist,
        platform,
    );

    useEffect(() => {
        if (platform) {
            currentListSourceStore.setValue({
                type: "music-sheet",
                path: `/main/toplist-detail/${platform}`,
                title: topListDetail?.title,
            });
        }
    }, [platform, topListDetail?.title]);

    useEffect(() => {
        if (platform && topListDetail) {
            remoteSheetInfoStore.setValue({
                platform,
                id: topListDetail.id,
                sheetItem: topListDetail,
            });
        }
    }, [platform, topListDetail]);

    return (
        <div id="page-container" className="page-container">
            <MusicSheetlikeView
                musicSheet={topListDetail}
                musicList={topListDetail?.musicList ?? []}
                state={state}
                onLoadMore={loadMore}
            />
        </div>
    );
}
