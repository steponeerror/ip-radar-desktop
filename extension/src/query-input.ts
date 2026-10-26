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
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  keyCode: number;
}) {
  if (event.isComposing || event.keyCode === 229) return;
  if (
    event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key === "Enter"
  )
    return "newline";
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
    return "submit";
}

/** Extract whole tokens only; never repair or truncate a malformed address. */
export function cleanIpInput(text: string): string | undefined {
  const tokens = text.split(/[\s,;，；、：="'(){}<>]+/u).filter(Boolean);
  const ips = [...new Set(tokens.flatMap((token) => parseIps(token).ips))];
  return ips.length ? ips.join("\n") : undefined;
}
