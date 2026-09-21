import { load as storeLoad } from "@tauri-apps/plugin-store";
import type { Settings } from "./sources/_types";

export type { Settings };

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: "http://127.0.0.1:8000",
  ipradarKey: "",
  abuseipdbKey: "",
  maxIps: 100,
  hotkey: "CmdOrCtrl+Alt+I",
  language: "auto",
  theme: "dark",
  sourceEnabled: { ipradar: true, abuseipdb: true },
  showMissingKey: false,
  autostart: false,
};

/** 存量部分字段合并默认值:升级兼容,sourceEnabled 键级深合并。 */
export function mergeSettings(partial: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(partial ?? {}),
    sourceEnabled: { ...DEFAULT_SETTINGS.sourceEnabled, ...(partial?.sourceEnabled ?? {}) },
  };
}

/** 读 store,缺项回填默认值(settings.json 单键 "settings")。 */
export async function loadSettings(): Promise<Settings> {
  const store = await storeLoad("settings.json");
  return mergeSettings(await store.get<Partial<Settings>>("settings"));
}

export async function saveSettings(s: Settings): Promise<void> {
  const store = await storeLoad("settings.json");
  await store.set("settings", s);
  await store.save();
}
