import { extensionApi } from "./web-extension";
import { applyStorageChanges } from "./storage";
import {
  initialState,
  normalizeState,
  serverOrigin,
  validateSettings,
  validateQuery,
  type Settings,
  type State,
} from "./model";
export const isExtension =
  !!extensionApi()?.runtime?.id;
export async function send(type: string, data = {}): Promise<State> {
  if (!isExtension) {
    if (type === "get") {
      if (
        import.meta.env.DEV &&
        new URLSearchParams(location.search).get("sample") === "reference"
      )
        return (await import("./preview")).referencePreview();
      return initialState();
    }
    throw new Error(
      "目前是介面預覽。請在 Chrome 載入 extension/dist 後使用查詢與儲存功能。",
    );
  }
  const reply = await extensionApi().runtime.sendMessage({ type, ...data });
  if (reply.error) throw new Error(reply.error);
  return normalizeState(reply.state);
}
export function subscribe(callback: (update: (state: State) => State) => void) {
  if (!isExtension) return () => {};
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (
      area === "local" &&
      Object.keys(changes).some((key) => key.startsWith("radar."))
    )
      callback((state) => applyStorageChanges(state, changes));
  };
  extensionApi().storage.onChanged.addListener(listener);
  return () => extensionApi().storage.onChanged.removeListener(listener);
}
export function openTab() {
  if (isExtension)
    return extensionApi().tabs.create({
      url: extensionApi().runtime.getURL("index.html?mode=tab"),
    });
  window.open("?mode=tab", "_blank");
}

/** Request host access directly from the query button's user gesture. */
export async function beginLookup(
  text: string,
  settings: Settings,
): Promise<State> {
  validateSettings(settings);
  validateQuery(text, settings.maxQueryIps);
  if (
    isExtension &&
    settings.radarEnabled &&
    !(await extensionApi().permissions.request({
      origins: [serverOrigin(settings.serverUrl)],
    }))
  ) {
    throw new Error("需要 Server 存取權限才能查詢。");
  }
  return send("start", { text });
}

/** Details are owned by the selected history view, not the shared page state. */
export async function loadHistoryBatch(id: string) {
  return (await send("batch", { id })).batches.find((batch) => batch.id === id);
}
