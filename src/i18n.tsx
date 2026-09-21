import { createContext, useContext, type ReactNode } from "react";

// 中英 dict,照 server 前端 useI18n 模式:扁平 key + {var} 插值,缺 key 回退 en 再回 key 本身。
type Lang = "zh" | "en";
export type Pref = "auto" | "zh" | "en";

const zh: Record<string, string> = {
  "abuse.country": "国家",
  "abuse.isp": "ISP",
  "abuse.last": "最近报告",
  "abuse.reporters": "报告者",
  "abuse.reports": "报告数",
  "abuse.tor": "Tor 节点",
  "abuse.usage": "用途",
  "app.title": "IP Radar",
  "common.back": "返回",
  "column.city": "城市",
  "column.country": "国家",
  "column.operator": "运营商",
  "ipDetail.range": "网段",
  "query.go": "查询",
  "query.placeholder": "输入或粘贴 IP…",
  "query.lookingUp": "查询中…",
  "query.noIp": "未识别到有效 IP",
  "settings.serverUrl": "Server 地址",
  "query.truncated": "共 {total} 个，已查前 {max}",
  "query.backToList": "结果列表",
  "query.invalidLines": "{n} 个无效输入被跳过",
  "query.warming": "预热中，就绪后自动重查…",
  "guidance.noKey": "未配置 IP Radar API key",
  "guidance.needsKey": "未配置 API key",
  "guidance.goSettings": "去设置",
  "guidance.adminHint": "浏览器打开 {url}/admin → API Keys → 签发后粘贴",
  "query.noResults": "无结果",
  "settings.ipradarKey": "IP Radar API key",
  "settings.abuseipdbKey": "AbuseIPDB API key",
  "settings.maxIps": "单次最大查询数",
  "settings.hotkey": "全局快捷键",
  "settings.language": "语言",
  "settings.sourceToggles": "查询源",
  "settings.showMissingKey": "结果区显示缺 key 源占位卡",
  "settings.autostart": "开机自启动",
  "settings.captureHint": "按下组合键（需含 Ctrl/Cmd/Alt/Shift 至少一个），Esc 取消",
  "settings.captureHotkey": "录入新组合",
  "settings.save": "保存",
  "settings.serverUrlInvalid": "地址需以 http:// 或 https:// 开头",
  "settings.tauriHint": "已保存，但系统设置应用失败：{msg}",
  "verdict.malicious": "恶意",
  "verdict.suspicious": "可疑",
  "verdict.benign": "良性",
  "verdict.informational": "信息",
  "verdict.reserved": "保留",
  "src.ipradar": "IP Radar",
  "src.abuseipdb": "AbuseIPDB",
  "src.system": "系统",
  "err.401": "未授权：需要有效的 IP Radar API key",
  "err.403": "key 已被吊销或禁用",
  "err.429": "请求过频，{seconds} 秒后重试",
  "err.timeout": "请求超时",
};

const en: Record<string, string> = {
  "abuse.country": "Country",
  "abuse.isp": "ISP",
  "abuse.last": "Last report",
  "abuse.reporters": "Reporters",
  "abuse.reports": "Reports",
  "abuse.tor": "Tor node",
  "abuse.usage": "Usage",
  "app.title": "IP Radar",
  "common.back": "Back",
  "column.city": "City",
  "column.country": "Country",
  "column.operator": "Operator",
  "ipDetail.range": "Range",
  "query.go": "Look up",
  "query.placeholder": "Paste or type an IP…",
  "query.lookingUp": "Looking up…",
  "query.noIp": "No valid IP found",
  "settings.serverUrl": "Server URL",
  "query.truncated": "{total} found, queried first {max}",
  "query.backToList": "Results",
  "query.invalidLines": "{n} invalid lines skipped",
  "query.warming": "Warming up, will re-query when ready…",
  "guidance.noKey": "No IP Radar API key configured",
  "guidance.needsKey": "No API key configured",
  "guidance.goSettings": "Open settings",
  "guidance.adminHint": "Open {url}/admin in a browser → API Keys → issue and paste",
  "query.noResults": "No results",
  "settings.ipradarKey": "IP Radar API key",
  "settings.abuseipdbKey": "AbuseIPDB API key",
  "settings.maxIps": "Max IPs per query",
  "settings.hotkey": "Global hotkey",
  "settings.language": "Language",
  "settings.sourceToggles": "Sources",
  "settings.showMissingKey": "Show placeholder for keyless sources",
  "settings.autostart": "Launch at login",
  "settings.captureHint": "Press a combo (needs at least one of Ctrl/Cmd/Alt/Shift), Esc to cancel",
  "settings.captureHotkey": "Record new combo",
  "settings.save": "Save",
  "settings.serverUrlInvalid": "URL must start with http:// or https://",
  "settings.tauriHint": "Saved, but applying a system setting failed: {msg}",
  "verdict.malicious": "Malicious",
  "verdict.suspicious": "Suspicious",
  "verdict.benign": "Benign",
  "verdict.informational": "Informational",
  "verdict.reserved": "Reserved",
  "src.ipradar": "IP Radar",
  "src.abuseipdb": "AbuseIPDB",
  "src.system": "System",
  "err.401": "Unauthorized: a valid IP Radar API key is required",
  "err.403": "Key revoked or disabled",
  "err.429": "Rate limited, retry in {seconds}s",
  "err.timeout": "Request timed out",
};

const DICTS: Record<Lang, Record<string, string>> = { zh, en };

export function resolveLang(pref: Pref): Lang {
  if (pref === "auto") return navigator.language.startsWith("zh") ? "zh" : "en";
  return pref;
}

interface I18nCtx {
  lang: Lang;
  pref: Pref;
  setPref: (p: Pref) => void;
}

const I18nContext = createContext<I18nCtx>({
  lang: "en",
  pref: "auto",
  setPref: () => {},
});

export function I18nProvider({ preference, setPreference, children }: {
  preference: Pref;
  setPreference: (p: Pref) => void;
  children: ReactNode;
}) {
  const lang = resolveLang(preference);
  return (
    <I18nContext.Provider value={{ lang, pref: preference, setPref: setPreference }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): { t(key: string, vars?: Record<string, string | number>): string; lang: Lang } {
  const { lang } = useContext(I18nContext);
  return {
    lang,
    t(key, vars) {
      let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
  };
}
