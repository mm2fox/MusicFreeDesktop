import AppHeader from "./components/Header";

import "./app.scss";
import MusicBar from "./components/MusicBar";
import { Outlet } from "react-router";
import PanelComponent from "./components/Panel";
import MusicDetail from "@renderer/components/MusicDetail";
import { useEffect } from "react";
import XiaoaiService from "./services/xiaoai-service";
import { getUserPreference } from "./utils/user-perference";
import trackPlayer from "./core/track-player";

export default function App() {
    useEffect(() => {
        const initXiaoai = async () => {
            const savedUsername = getUserPreference("xiaoaiUsername") || "";
            const savedPassword = getUserPreference("xiaoaiPassword") || "";
            const savedUseXiaoai = getUserPreference("useXiaoaiOutput");

            if (savedUsername && savedPassword) {
                const loggedIn = await XiaoaiService.isLoggedIn();
                if (!loggedIn) {
                    const success = await XiaoaiService.autoLogin(savedUsername, savedPassword);
                    if (success && savedUseXiaoai === true) {
                        // 登录成功且上次是小米音箱模式，自动切换
                        await trackPlayer.setOutputController("xiaoai");
                    }
                } else if (savedUseXiaoai === true) {
                    // 已登录且上次是小米音箱模式，自动切换
                    await trackPlayer.setOutputController("xiaoai");
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
