// 设置页:8 项表单按 brutalist 分区制收纳(SERVER / KEYS / QUERY / HOTKEY / SYSTEM)。
// 本地草稿(initial → state),保存时落 store + 热注册快捷键/自启;
// App 持有 settings 真相(本组件不读 store)。set_hotkey/set_autostart 失败非致命:store 已存,留在本页展示提示。
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../sources/_types";
import { saveSettings } from "../settings";
import { getSources } from "../sources/registry";
import { useI18n } from "../i18n";
import { buildAccel } from "../hotkeyAccel";
import { TECH_LABEL } from "./badges";
import { ArrowLeft } from "@phosphor-icons/react";

interface Props {
  initial: Settings;
  onSaved: (s: Settings) => void;
  onClose: () => void;
}

const INPUT_CLS =
  "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 transition-colors placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500/30";
const LABEL_CLS = "block text-xs font-medium text-zinc-400";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-800">
      <div className="border-b border-zinc-800 px-3 py-1.5">
        <span className={TECH_LABEL}>{title}</span>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </div>
  );
}

export function SettingsPage({ initial, onSaved, onClose }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<Settings>(initial);
  const [maxIpsRaw, setMaxIpsRaw] = useState(String(initial.maxIps));
  const [capturing, setCapturing] = useState(false);
  const [urlInvalid, setUrlInvalid] = useState(false);
  const [applyHint, setApplyHint] = useState<string | null>(null);

  // 快捷键录入:窗口级捕获 keydown,Esc 取消,合法组合写入草稿
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      const accel = buildAccel(e);
      if (accel) {
        setForm(f => ({ ...f, hotkey: accel }));
        setCapturing(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing]);

  const save = async () => {
    const url = form.serverUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      setUrlInvalid(true);
      return;
    }
    setUrlInvalid(false);
    setApplyHint(null);
    // maxIps:1..1000 clamp(空/NaN 回退 100);clamp 后回写输入框(R3),避免 1000→100 显示错位
    const n = Math.round(Number(maxIpsRaw));
    const next: Settings = {
      ...form,
      serverUrl: url,
      maxIps: Math.min(1000, Math.max(1, Number.isFinite(n) && n > 0 ? n : 100)),
    };
    setMaxIpsRaw(String(next.maxIps));
    await saveSettings(next);
    onSaved(next);
    // 热应用:仅变更项触发;失败非致命(浏览器 dev 下会走到 catch)
    const failures: string[] = [];
    if (next.hotkey !== initial.hotkey) {
      try {
        await invoke("set_hotkey", { accel: next.hotkey });
      } catch (e) {
        failures.push(String(e));
      }
    }
    if (next.autostart !== initial.autostart) {
      try {
        await invoke("set_autostart", { enabled: next.autostart });
      } catch (e) {
        failures.push(String(e));
      }
    }
    if (failures.length > 0) {
      // 不自动关闭:设置已保存,留在本页让用户看到失败提示;点返回即离开
      setApplyHint(t("settings.tauriHint", { msg: failures[0].slice(0, 120) }));
      return;
    }
    onClose();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-zinc-800 px-4 py-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition active:scale-[0.97] hover:bg-zinc-800 hover:text-zinc-300"
        >
          <ArrowLeft size={12} weight="bold" /> {t("common.back")}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Section title={t("settings.secServer")}>
          <div className="space-y-1">
            <label className={LABEL_CLS} htmlFor="serverUrl">
              {t("settings.serverUrl")}
            </label>
            <input
              id="serverUrl"
              value={form.serverUrl}
              onChange={e => {
                setForm(f => ({ ...f, serverUrl: e.target.value }));
                if (urlInvalid) setUrlInvalid(false);   // 重新编辑即清除错误提示(R3)
              }}
              placeholder="http://127.0.0.1:8000"
              className={`${INPUT_CLS}${urlInvalid ? " border-red-500/50" : ""}`}
            />
            {urlInvalid && <p className="text-xs text-red-400">{t("settings.serverUrlInvalid")}</p>}
          </div>
        </Section>

        <Section title={t("settings.secKeys")}>
          <div className="space-y-1">
            <label className={LABEL_CLS} htmlFor="ipradarKey">
              {t("settings.ipradarKey")}
            </label>
            <input
              id="ipradarKey"
              type="password"
              value={form.ipradarKey}
              onChange={e => setForm(f => ({ ...f, ipradarKey: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL_CLS} htmlFor="abuseipdbKey">
              {t("settings.abuseipdbKey")}
            </label>
            <input
              id="abuseipdbKey"
              type="password"
              value={form.abuseipdbKey}
              onChange={e => setForm(f => ({ ...f, abuseipdbKey: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>
        </Section>

        <Section title={t("settings.secQuery")}>
          <div className="space-y-1">
            <label className={LABEL_CLS} htmlFor="maxIps">
              {t("settings.maxIps")}
            </label>
            <input
              id="maxIps"
              type="number"
              min={1}
              max={1000}
              value={maxIpsRaw}
              onChange={e => setMaxIpsRaw(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <span className={LABEL_CLS}>{t("settings.sourceToggles")}</span>
            {getSources().map(src => (
              <label key={src.id} className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.sourceEnabled[src.id] ?? true}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      sourceEnabled: { ...f.sourceEnabled, [src.id]: e.target.checked },
                    }))
                  }
                  className="h-3.5 w-3.5 accent-zinc-500"
                />
                {src.label}
              </label>
            ))}
          </div>
        </Section>

        <Section title={t("settings.hotkey")}>
          <div className="flex items-center gap-2">
            <code className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-300">
              {form.hotkey}
            </code>
            <button
              onClick={() => setCapturing(true)}
              className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-700 hover:text-zinc-100"
            >
              {t("settings.captureHotkey")}
            </button>
          </div>
          {capturing && <p className="text-xs text-emerald-400">{t("settings.captureHint")}</p>}
        </Section>

        <Section title={t("settings.secSystem")}>
          <div className="space-y-1">
            <label className={LABEL_CLS} htmlFor="language">
              {t("settings.language")}
            </label>
            <select
              id="language"
              value={form.language}
              onChange={e => setForm(f => ({ ...f, language: e.target.value as Settings["language"] }))}
              className={INPUT_CLS}
            >
              <option value="auto">Auto</option>
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.showMissingKey}
              onChange={e => setForm(f => ({ ...f, showMissingKey: e.target.checked }))}
              className="h-3.5 w-3.5 accent-zinc-500"
            />
            {t("settings.showMissingKey")}
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.autostart}
              onChange={e => setForm(f => ({ ...f, autostart: e.target.checked }))}
              className="h-3.5 w-3.5 accent-zinc-500"
            />
            {t("settings.autostart")}
          </label>
        </Section>

        {applyHint && (
          <p className="border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-400">
            {applyHint}
          </p>
        )}
      </div>

      <div className="border-t border-zinc-800 p-4">
        <button
          onClick={() => void save()}
          className="w-full rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 transition active:scale-[0.98] hover:bg-white"
        >
          {t("settings.save")}
        </button>
      </div>
    </div>
  );
}
