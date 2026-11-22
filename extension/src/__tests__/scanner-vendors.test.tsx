import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FullResult } from "../ResultView";
import { toCsv } from "../csv";
import { scannerVendors } from "../result-model";
import type { Row } from "../model";
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

const scannerRow: Row = {
  ip: "205.210.31.99",
  status: "done",
  queriedAt: "",
  errors: [],
  sections: [
    {
      sourceId: "ipradar",
      status: "ok",
      data: {
        ip: "205.210.31.99",
        threat: { verdict: "malicious", confidence: 95, types: [], is_cdn: false },
        classifications: {
          scanner: {
            verdict: "malicious",
            detected: true,
            confidence: 95,
            malware_names: [],
            details: [
              {
                source: "scanner_ranges",
                native_categories: [
                  "研究扫描 · BitSight(自报段)",
                  "研究扫描 · Censys(自报段)",
                ],
              },
              // sw_scanners 计数形标签不得混入
              { source: "sw_scanners", native_categories: ["12 · BitSight(3)"] },
            ],
          },
          blacklist: {
            verdict: "suspicious",
            detected: true,
            confidence: 84,
            malware_names: [],
          },
        },
      } as LookupResult,
    },
  ],
};

describe("研究扫描厂商标签呈现", () => {
  it("以 Badge 标签与分类标签同排呈现,不再另起小字行", () => {
    const full = renderToStaticMarkup(<FullResult row={scannerRow} />);
    expect(full).toContain("掃描 95");
    expect(full).toContain("黑名單 84");
    const chips =
      full.match(/<span[^>]*data-slot="badge"[^>]*>[^<]*研究扫描[^<]*<\/span>/g) ??
      [];
    expect(chips.map((c) => c.replace(/<[^>]*>/g, ""))).toEqual([
      "研究扫描 · BitSight(自报段)",
      "研究扫描 · Censys(自报段)",
    ]);
    // 每个标签独立成 chip:不再用顿号串成一行小字
    expect(full).not.toContain("、研究扫描 · Censys(自报段)");
  });

  it("CSV 分类命中列追加自报段厂商标签,计数形标签不入列", () => {
    const csv = toCsv([scannerRow]);
    expect(csv).toContain(
      '"掃描: malicious / 95 | 黑名單: suspicious / 84 | 研究扫描 · BitSight(自报段) | 研究扫描 · Censys(自报段)"',
    );
    expect(csv).not.toContain("12 · BitSight(3)");
  });
});
