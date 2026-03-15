import CheckBoxSettingItem from "../../components/CheckBoxSettingItem";
import "./index.scss";
import ColorPickerSettingItem from "../../components/ColorPickerSettingItem";
import ListBoxSettingItem from "../../components/ListBoxSettingItem";
import FontPickerSettingItem from "../../components/FontPickerSettingItem";
import InputSettingItem from "../../components/InputSettingItem";
import { IfTruthy } from "@/renderer/components/Condition";
import { useTranslation } from "react-i18next";
import { getGlobalContext } from "@/shared/global-context/renderer";
import { appWindowUtil } from "@shared/utils/renderer";
import useAppConfig from "@/hooks/useAppConfig";
import { getAvailableProviders, getBaiduTypes, TARGET_LANGUAGES } from "@/renderer/services/translate-service";

const numberArray = Array(65)
    .fill(0)
    .map((_, index) => 16 + index);

export default function Lyric() {
    const { t } = useTranslation();
    const translateProvider = useAppConfig("translate.provider");
    const baiduType = useAppConfig("translate.baiduType");
    const providers = getAvailableProviders();
    const baiduTypes = getBaiduTypes();

    return (
        <div className="setting-view--lyric-container">
            <IfTruthy condition={getGlobalContext().platform === "darwin"}>
                <CheckBoxSettingItem
                    label={t("settings.lyric.enable_status_bar_lyric")}
                    keyPath="lyric.enableStatusBarLyric"
                ></CheckBoxSettingItem>
            </IfTruthy>
            <CheckBoxSettingItem
                label={t("settings.lyric.enable_desktop_lyric")}
                keyPath="lyric.enableDesktopLyric"
                onChange={(_evt, checked) => {
                    appWindowUtil.setLyricWindow(checked);
                }}
            ></CheckBoxSettingItem>
            <CheckBoxSettingItem
                label={t("settings.lyric.lock_desktop_lyric")}
                keyPath="lyric.lockLyric"
            ></CheckBoxSettingItem>
            <CheckBoxSettingItem
                label={t("settings.lyric.show_translation")}
                keyPath="lyric.showTranslation"
            ></CheckBoxSettingItem>
            <FontPickerSettingItem
                label={t("settings.lyric.font")}
                keyPath="lyric.fontData"
            ></FontPickerSettingItem>
            <ListBoxSettingItem
                keyPath="lyric.fontSize"
                options={numberArray}
                label={t("settings.lyric.font_size")}
            ></ListBoxSettingItem>
            <ColorPickerSettingItem
                label={t("settings.lyric.font_color")}
                keyPath="lyric.fontColor"
            ></ColorPickerSettingItem>
            <ColorPickerSettingItem
                label={t("settings.lyric.stroke_color")}
                keyPath="lyric.strokeColor"
            ></ColorPickerSettingItem>
            
            <div className="setting-view--section-title" style={{ marginTop: "20px" }}>
                {t("settings.lyric.translate_section")}
            </div>
            
            <ListBoxSettingItem
                keyPath="translate.targetLanguage"
                options={TARGET_LANGUAGES.map(l => l.value)}
                label={t("settings.lyric.target_language")}
                renderItem={(item) => {
                    const lang = TARGET_LANGUAGES.find(l => l.value === item);
                    return lang ? lang.label : item;
                }}
            ></ListBoxSettingItem>
            
            <ListBoxSettingItem
                keyPath="translate.provider"
                options={providers.map(p => p.value)}
                label={t("settings.lyric.translate_provider")}
                renderItem={(item) => {
                    const provider = providers.find(p => p.value === item);
                    return provider ? `${provider.label}${provider.requiresKey ? ` (${t("settings.lyric.requires_config")})` : ""}` : item;
                }}
            ></ListBoxSettingItem>
            
            <CheckBoxSettingItem
                label={t("settings.lyric.auto_save_translation")}
                keyPath="translate.autoSaveTranslation"
            ></CheckBoxSettingItem>
            
            <CheckBoxSettingItem
                label={t("settings.lyric.auto_translate_non_chinese")}
                keyPath="translate.autoTranslateNonChinese"
            ></CheckBoxSettingItem>
            
            <IfTruthy condition={translateProvider === "baidu"}>
                <ListBoxSettingItem
                    keyPath="translate.baiduType"
                    options={baiduTypes.map(bt => bt.value)}
                    label={t("settings.lyric.baidu_type")}
                    renderItem={(item) => {
                        const type = baiduTypes.find(bt => bt.value === item);
                        return type ? `${type.label} (${type.description})` : item;
                    }}
                ></ListBoxSettingItem>
                
                <IfTruthy condition={baiduType === "standard"}>
                    <InputSettingItem
                        keyPath="translate.baiduAppId"
                        label={t("settings.lyric.baidu_app_id")}
                        width="100%"
                    ></InputSettingItem>
                    <InputSettingItem
                        keyPath="translate.baiduSecretKey"
                        label={t("settings.lyric.baidu_secret_key")}
                        width="100%"
                    ></InputSettingItem>
                    <div className="setting-view--hint-text">
                        {t("settings.lyric.baidu_standard_hint")}
                    </div>
                </IfTruthy>
                
                <IfTruthy condition={baiduType === "llm"}>
                    <InputSettingItem
                        keyPath="translate.baiduLLMAppId"
                        label={t("settings.lyric.baidu_app_id")}
                        width="100%"
                    ></InputSettingItem>
                    <InputSettingItem
                        keyPath="translate.baiduLLMApiKey"
                        label={t("settings.lyric.baidu_llm_api_key")}
                        width="100%"
                    ></InputSettingItem>
                    <div className="setting-view--hint-text">
                        {t("settings.lyric.baidu_llm_hint")}
                    </div>
                </IfTruthy>
            </IfTruthy>
        </div>
    );
}
