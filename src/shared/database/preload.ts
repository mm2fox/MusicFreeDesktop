/**
 * 数据库模块
 * 
 * 此模块负责加载数据库相关的功能，提供渲染进程需要的业务逻辑。
 */

import { app } from "electron";
import path from "node:path";
import Database from "better-sqlite3";

const appDbPath = path.resolve(app.getPath("userData"), "./app-database/database.db");

const database = new Database(appDbPath);
