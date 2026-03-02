import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useEffect, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { hideModal } from "../..";
import {
    getMusicTags,
    setMusicTags,
    useAllCustomTags,
    LocalMusicItem,
} from "@/renderer/core/local-music/custom-tags";
import { useDraggable } from "../TagEditor/useDraggable";

interface ICustomTagsEditorProps {
    musicItem: IMusic.IMusicItem;
    musicItems?: IMusic.IMusicItem[];
}

export default function CustomTagsEditor(props: ICustomTagsEditorProps) {
    const { musicItem, musicItems } = props;
    const { t } = useTranslation();

    const [currentTags, setCurrentTags] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [saving, setSaving] = useState(false);
    const allTags = useAllCustomTags();

    const { position, handleMouseDown } = useDraggable();

    useEffect(() => {
        if (musicItem) {
            setCurrentTags(getMusicTags(musicItem));
        }
    }, [musicItem]);

    const handleAddTag = async (tag: string) => {
        const trimmedTag = tag.trim();
        if (!trimmedTag) return;
        
        if (currentTags.includes(trimmedTag)) {
            toast.info(t("custom_tags.tag_already_exists"));
            return;
        }

        const newTags = [...currentTags, trimmedTag];
        setCurrentTags(newTags);
        setInputValue("");
    };

    const handleRemoveTag = (tag: string) => {
        const newTags = currentTags.filter(t => t !== tag);
        setCurrentTags(newTags);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddTag(inputValue);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (musicItems && musicItems.length > 1) {
                let successCount = 0;
                for (const item of musicItems) {
                    const result = await setMusicTags(item, currentTags);
                    if (result) successCount++;
                }
                toast.success(t("custom_tags.save_success_multiple", { count: successCount }));
            } else {
                const result = await setMusicTags(musicItem, currentTags);
                if (result) {
                    toast.success(t("custom_tags.save_success"));
                } else {
                    toast.error(t("custom_tags.save_error"));
                }
            }
            hideModal();
        } catch (e) {
            console.error("[CustomTagsEditor] Save error:", e);
            toast.error(t("custom_tags.save_error"));
        } finally {
            setSaving(false);
        }
    };

    const handleQuickAddTag = (tag: string) => {
        if (!currentTags.includes(tag)) {
            setCurrentTags([...currentTags, tag]);
        }
    };

    const suggestedTags = allTags.filter(tag => !currentTags.includes(tag));

    return (
        <Base withBlur={false}>
            <div
                className="modal--custom-tags-editor-container shadow backdrop-color"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                }}
            >
                <div
                    className="custom-tags-editor-header"
                    onMouseDown={handleMouseDown}
                >
                    <span className="custom-tags-editor-title">
                        {musicItems && musicItems.length > 1
                            ? t("custom_tags.title_multiple", { count: musicItems.length })
                            : t("custom_tags.title")}
                    </span>
                    <div
                        role="button"
                        className="custom-tags-editor-close opacity-button"
                        onClick={hideModal}
                    >
                        <SvgAsset iconName="x-mark"></SvgAsset>
                    </div>
                </div>
                <div className="custom-tags-editor-content">
                    <div className="current-tags-section">
                        <label>{t("custom_tags.current_tags")}</label>
                        <div className="tags-container">
                            {currentTags.length === 0 ? (
                                <span className="no-tags-hint">{t("custom_tags.no_tags")}</span>
                            ) : (
                                currentTags.map((tag) => (
                                    <div key={tag} className="tag-item">
                                        <span>{tag}</span>
                                        <div
                                            role="button"
                                            className="tag-remove-btn"
                                            onClick={() => handleRemoveTag(tag)}
                                        >
                                            <SvgAsset iconName="x-mark" size={12}></SvgAsset>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="add-tag-section">
                        <label>{t("custom_tags.add_tag")}</label>
                        <div className="add-tag-input-row">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                placeholder={t("custom_tags.tag_placeholder")}
                            />
                            <button
                                className="add-tag-btn"
                                onClick={() => handleAddTag(inputValue)}
                                disabled={!inputValue.trim()}
                            >
                                <SvgAsset iconName="plus" size={16}></SvgAsset>
                            </button>
                        </div>
                    </div>

                    {suggestedTags.length > 0 && (
                        <div className="suggested-tags-section">
                            <label>{t("custom_tags.suggested_tags")}</label>
                            <div className="suggested-tags-container">
                                {suggestedTags.slice(0, 10).map((tag) => (
                                    <div
                                        key={tag}
                                        role="button"
                                        className="suggested-tag-item"
                                        onClick={() => handleQuickAddTag(tag)}
                                    >
                                        <SvgAsset iconName="plus" size={12}></SvgAsset>
                                        <span>{tag}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="form-actions">
                        <button className="btn-cancel" onClick={hideModal}>
                            {t("common.cancel")}
                        </button>
                        <button
                            className="btn-save"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <SvgAsset iconName="rolling-1s" size={14} />
                                    <span>{t("custom_tags.saving")}</span>
                                </>
                            ) : (
                                <span>{t("common.save")}</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Base>
    );
}
