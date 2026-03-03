import { Tab } from "@headlessui/react";
import "./index.scss";
import Downloaded from "./components/Downloaded";
import Downloading from "./components/Downloading";
import InvalidDownloads from "./components/InvalidDownloads";
import { useTranslation } from "react-i18next";

export default function DownloadView() {
    const { t } = useTranslation();

    return (
        <div
            id="page-container"
            className="page-container download-view--container"
        >
            <Tab.Group>
                <Tab.List className="tab-list-container">
                    <Tab as="div" className="tab-list-item">
                        {t("common.downloaded")}
                    </Tab>
                    <Tab as="div" className="tab-list-item">
                        {t("common.downloading")}
                    </Tab>
                    <Tab as="div" className="tab-list-item">
                        {t("download_page.invalid_downloads")}
                    </Tab>
                </Tab.List>
                <Tab.Panels className={"tab-panels-container"}>
                    <Tab.Panel className="tab-panel-container">
                        <Downloaded></Downloaded>
                    </Tab.Panel>
                    <Tab.Panel className="tab-panel-container">
                        <Downloading></Downloading>
                    </Tab.Panel>
                    <Tab.Panel className="tab-panel-container">
                        <InvalidDownloads></InvalidDownloads>
                    </Tab.Panel>
                </Tab.Panels>
            </Tab.Group>
        </div>
    );
}
