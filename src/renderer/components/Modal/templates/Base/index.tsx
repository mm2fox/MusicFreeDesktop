import { ReactNode, useRef } from "react";
import { hideModal } from "../..";
import "./index.scss";
import SvgAsset from "@/renderer/components/SvgAsset";

interface IBaseModalProps {
    onDefaultClick?: () => void;
    defaultClose?: boolean;
    withBlur?: boolean;
    children: ReactNode;
    draggable?: boolean;
}

const baseId = "components--modal-base-container";

export function Base(props: IBaseModalProps) {
    const {
        onDefaultClick,
        defaultClose = false,
        children,
        withBlur = true,
        draggable = false,
    } = props;

    const trapCloseRef = useRef(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement)?.id === baseId) {
            trapCloseRef.current = true;
        } else {
            trapCloseRef.current = false;
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement)?.id === baseId && trapCloseRef.current) {
            if (defaultClose) {
                hideModal();
            } else {
                onDefaultClick?.();
            }
        }
    };

    return (
        <div
            id={baseId}
            className={`components--modal-base animate__animated animate__fadeIn ${withBlur ? "blur10" : ""} ${draggable ? "draggable" : ""}`}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
                trapCloseRef.current = false;
            }}
            onMouseOut={() => {
                trapCloseRef.current = false;
            }}
        >
            {children}
        </div>
    );
}

interface IHeaderProps {
    children: ReactNode;
}
function Header(props: IHeaderProps) {
    const { children } = props;

    return (
        <div className="components--modal-base-header">
            {children}
            <div
                role="button"
                className="components--modal-base-header-close opacity-button"
                onClick={() => {
                    hideModal();
                }}
            >
                <SvgAsset iconName="x-mark"></SvgAsset>
            </div>
        </div>
    );
}

Base.Header = Header;
export default Base;
