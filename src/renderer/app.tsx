import AppHeader from "./components/Header";

import "./app.scss";
import MusicBar from "./components/MusicBar";
import { Outlet } from "react-router";
import PanelComponent from "./components/Panel";
import MusicDetail from "@renderer/components/MusicDetail";
import { useEffect } from "react";
import XiaoaiService from "./services/xiaoai-service";
import { getUserPreference } from "./utils/user-perference";

export default function App() {
    useEffect(() => {
        const initXiaoai = async () => {
            const savedUsername = getUserPreference("xiaoaiUsername") || "";
            const savedPassword = getUserPreference("xiaoaiPassword") || "";

            if (savedUsername && savedPassword) {
                const loggedIn = await XiaoaiService.isLoggedIn();
                if (!loggedIn) {
                    await XiaoaiService.autoLogin(savedUsername, savedPassword);
                }
            }
        };
        initXiaoai();
    }, []);

    return (
        <div className="app-container">
            <AppHeader></AppHeader>
            <div className="body-container">
                <Outlet></Outlet>
                <PanelComponent></PanelComponent>
            </div>
            <MusicDetail></MusicDetail>
            <MusicBar></MusicBar>
        </div>
    );
}
