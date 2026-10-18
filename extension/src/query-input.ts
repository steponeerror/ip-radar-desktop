import { parseIps } from "./model";

// Accept only an IP list, never extract IP-like fragments from unrelated text.
export function clipboardIpList(text: string): string | undefined {
  if (
    !text.trim() ||
    text.length > 65536 ||
    !/^[\da-fA-F.:\[\]\s,;]+$/.test(text)
  )
    return;
  const { ips, invalid } = parseIps(text);
  return ips.length && !invalid.length ? ips.join("\n") : undefined;
}

export function queryInputKey(event: {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  keyCode: number;
}) {
  if (event.isComposing || event.keyCode === 229) return;
  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === "Space"
  )
    return "newline";
  if (event.key === "Enter") return "submit";
}
