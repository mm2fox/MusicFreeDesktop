import { localPluginName } from "@/common/constant";
import Downloader from "@/renderer/core/downloader";

export default function isLocalMusic(mediaItem: IMedia.IMediaBase) {
    return mediaItem?.platform === localPluginName;
}

export function isLocalMusicOrDownloaded(mediaItem: IMedia.IMediaBase) {
    return mediaItem?.platform === localPluginName || Downloader.isDownloaded(mediaItem);
}
