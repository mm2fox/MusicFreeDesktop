import { app } from "electron";
import fs from "fs";
import path from "path";

if (process.defaultApp) {
    const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
    const releaseUserDataPath = path.join(appDataPath, "MusicFree");
    try {
        fs.mkdirSync(releaseUserDataPath, { recursive: true });
    } catch { }
    app.setPath("userData", releaseUserDataPath);
    app.setPath("appData", releaseUserDataPath);
    console.log("[Dev Mode] Set userData path to:", releaseUserDataPath);
}
