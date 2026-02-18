import { memo } from "react";
import SvgAsset from "@/renderer/components/SvgAsset";
import { showModal } from "@/renderer/components/Modal";
import { isSameMedia } from "@/common/media-util";
import { useTranslation } from "react-i18next";
import "./index.scss";

interface IMusicInfoProps {
    musicItem: IMusic.IMusicItem;
    size?: number;
}

function MusicInfo(props: IMusicInfoProps) {
    const { musicItem, size = 18 } = props;
    const { t } = useTranslation();

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        showModal("MusicInfo", { musicItem });
    };

    return (
        <div
            className="music-info-button opacity-button"
            title={t("music_info.title")}
            onClick={handleClick}
        >
            <SvgAsset iconName="info" size={size}></SvgAsset>
        </div>
    );
}

export default memo(MusicInfo, (prev, curr) =>
    isSameMedia(prev.musicItem, curr.musicItem),
);
