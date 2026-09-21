import { describe, test, expect } from "vitest";
import { extractIps } from "../extractIps";

describe("extractIps", () => {
  test("单个 IPv4", () => {
    expect(extractIps("80.82.77.139", 100)).toEqual({ ips: ["80.82.77.139"], total: 1 });
  });
  test("IPv4 带端口后缀剥离", () => {
    expect(extractIps("1.2.3.4:8080 blocked", 100).ips).toEqual(["1.2.3.4"]);
  });
  test("数字粘尾不截半(123.1.2.3.4 不是 IP)", () => {
    expect(extractIps("id=123.1.2.3.4", 100).ips).toEqual([]);
  });
  test("段值 >255 拒绝", () => {
    expect(extractIps("300.1.2.3", 100).ips).toEqual([]);
  });
  test("多 IP 去重保序 + CSV 残留", () => {
    const r = extractIps("1.1.1.1,2.2.2.2\n1.1.1.1;8.8.8.8", 100);
    expect(r).toEqual({ ips: ["1.1.1.1", "2.2.2.2", "8.8.8.8"], total: 3 });
  });
  test("IPv6 裸地址与 v4-mapped", () => {
    expect(extractIps("fe80::1 last seen", 100).ips).toEqual(["fe80::1"]);
    // ::ffff:1.2.3.4 的尾段 1.2.3.4 也会被 V4_RE 命中 —— 双形态并存是预期(不同键,plan Task2 注),
    // 故断言包含 v4-mapped 形态而非整表相等。
    const r = extractIps("::ffff:1.2.3.4 mapped", 100);
    expect(r.ips).toContain("::ffff:1.2.3.4");
  });
  test("IPv6 括号+端口 [fe80::1]:443", () => {
    expect(extractIps("[fe80::1]:443 open", 100).ips).toEqual(["fe80::1"]);
  });
  test("IPv6 zone-id 剥离 fe80::1%eth0", () => {
    expect(extractIps("fe80::1%eth0", 100).ips).toEqual(["fe80::1"]);
  });
  test("裸 :: 合法", () => {
    expect(extractIps("src ::", 100).ips).toEqual(["::"]);
  });
  test("超上限截断且 total 报全量", () => {
    const text = Array.from({ length: 150 }, (_, i) => `10.0.0.${i % 256}`).join("\n");
    // 10.0.0.0..149 → 150 个不同 IP
    const r = extractIps(text, 100);
    expect(r.ips.length).toBe(100);
    expect(r.total).toBe(150);
  });
  test("非 IP 文本返回空", () => {
    expect(extractIps("hello world v1.2.3", 100).ips).toEqual([]);
  });
  test("时间戳 12:34:56 不是 IPv6", () => {
    expect(extractIps("12:34:56", 100).ips).toEqual([]);
  });
});
