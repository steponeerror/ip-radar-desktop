import { describe, expect, it } from "vitest";
import { scannerVendors } from "../result-model";
import type { LookupResult } from "../../../shared/intelligence";

const radarWith = (
  classifications: LookupResult["classifications"],
): LookupResult => ({ ip: "205.210.31.99", classifications });

describe("scannerVendors", () => {
  it("收集 scanner 分类下 scanner_ranges 证人行的 native_categories,去重保序", () => {
    const d = radarWith({
      scanner: {
        verdict: "malicious",
        detected: true,
        confidence: 99,
        malware_names: [],
        details: [
          {
            source: "scanner_ranges",
            native_categories: ["研究扫描 · Palo Alto Xpanse(自报段)"],
          },
          {
            source: "scanner_ranges",
            native_categories: [
              "研究扫描 · Palo Alto Xpanse(自报段)",
              "研究扫描 · Censys(自报段)",
            ],
          },
          // sw_scanners 计数形标签不上(噪声守门,同 web 端)
          { source: "sw_scanners", native_categories: ["12 · Palo Alto(3)"] },
        ],
      },
    });
    expect(scannerVendors(d)).toEqual([
      "研究扫描 · Palo Alto Xpanse(自报段)",
      "研究扫描 · Censys(自报段)",
    ]);
  });

  it("scanner 未命中 / 无 details / 无数据时为空", () => {
    // detected:false 时证人行带标签也不出(钉住 detected 门)
    expect(
      scannerVendors(
        radarWith({
          scanner: {
            verdict: "benign",
            detected: false,
            confidence: 0,
            malware_names: [],
            details: [
              {
                source: "scanner_ranges",
                native_categories: ["研究扫描 · Censys(自报段)"],
              },
            ],
          },
        }),
      ),
    ).toEqual([]);
    expect(
      scannerVendors(
        radarWith({
          scanner: {
            verdict: "malicious",
            detected: true,
            confidence: 90,
            malware_names: [],
          },
        }),
      ),
    ).toEqual([]);
    expect(scannerVendors(undefined)).toEqual([]);
  });

  it("scanner_ranges 行缺 native_categories 或标签为空串时不吱声", () => {
    expect(
      scannerVendors(
        radarWith({
          scanner: {
            verdict: "malicious",
            detected: true,
            confidence: 99,
            malware_names: [],
            details: [
              { source: "scanner_ranges" },
              {
                source: "scanner_ranges",
                native_categories: ["", "研究扫描 · Censys(自报段)"],
              },
            ],
          },
        }),
      ),
    ).toEqual(["研究扫描 · Censys(自报段)"]);
  });

  it("连字符键名(scanner-x)不算 scanner,但 scanner 命中时正常收", () => {
    expect(
      scannerVendors(
        radarWith({
          "scanner-x": {
            verdict: "malicious",
            detected: true,
            confidence: 90,
            malware_names: [],
            details: [
              {
                source: "scanner_ranges",
                native_categories: ["研究扫描 · Censys(自报段)"],
              },
            ],
          },
        }),
      ),
    ).toEqual([]);
  });
});
