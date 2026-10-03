import { initialState, type State } from "./model";
export const isExtension =
  typeof chrome !== "undefined" && !!chrome.runtime?.id;
export async function send(type: string, data = {}): Promise<State> {
  if (!isExtension) {
    if (type === "get") return initialState();
    throw new Error(
      "目前是介面預覽。請在 Chrome 載入 extension/dist 後使用查詢與儲存功能。",
    );
  }
  const reply = await chrome.runtime.sendMessage({ type, ...data });
  if (reply.error) throw new Error(reply.error);
  return reply.state;
}
export function subscribe(callback: (state: State) => void) {
  if (!isExtension) return () => {};
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes.radarState?.newValue)
      callback(changes.radarState.newValue as State);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
export function openTab() {
  if (isExtension)
    return chrome.tabs.create({
      url: chrome.runtime.getURL("index.html?mode=tab"),
    });
  window.open("?mode=tab", "_blank");
}
