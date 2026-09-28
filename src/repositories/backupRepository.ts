import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, CategoryKey, Todo } from "../types";
import { normalizeSettings } from "./settingsRepository";

export interface RiheBackup {
  kind: "rihe-backup";
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  todos: Todo[];
  settings: AppSettings;
}

const categories: CategoryKey[] = ["work", "life", "study", "personal"];
const isTauri = () => "__TAURI_INTERNALS__" in window;

export function createBackup(todos: Todo[], settings: AppSettings): RiheBackup {
  return { kind: "rihe-backup", schemaVersion: 1, appVersion: "0.5.0", exportedAt: new Date().toISOString(), todos, settings };
}

export function parseBackup(source: string): RiheBackup {
  const value = JSON.parse(source) as Partial<RiheBackup>;
  if (value.kind !== "rihe-backup" || value.schemaVersion !== 1 || !Array.isArray(value.todos) || !value.settings) {
    throw new Error("这不是有效的铃RIN备份文件");
  }
  const valid = value.todos.every((todo) => todo && typeof todo.id === "string" && typeof todo.title === "string"
    && (todo.date === null || typeof todo.date === "string") && categories.includes(todo.category)
    && typeof todo.done === "boolean" && typeof todo.createdAt === "string" && typeof todo.updatedAt === "string");
  if (!valid) throw new Error("备份中的待办数据不完整或版本不兼容");
  return { ...(value as RiheBackup), settings: normalizeSettings(value.settings) };
}

function downloadInBrowser(payload: string) {
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `rihe-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function writeBackup(backup: RiheBackup, kind: "automatic" | "manual") {
  const payload = JSON.stringify(backup, null, 2);
  if (!isTauri()) {
    if (kind === "manual") downloadInBrowser(payload);
    else localStorage.setItem("rihe.backup.latest", payload);
    return kind === "manual" ? "浏览器下载目录" : "浏览器本地存储";
  }
  return invoke<string>("save_backup", { payload, kind });
}

export const backupRepository = {
  export(backup: RiheBackup) { return writeBackup(backup, "manual"); },
  async auto(backup: RiheBackup, force = false) {
    const key = "rihe.backup.last-auto";
    const last = Number(localStorage.getItem(key) || 0);
    if (!force && Date.now() - last < 24 * 60 * 60 * 1000) return "";
    const path = await writeBackup(backup, "automatic");
    localStorage.setItem(key, String(Date.now()));
    return path;
  },
};
