import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nContext, resolveLanguage } from "../i18n";
import { FullResult, Results } from "../ResultView";
import { toCsv } from "../csv";
import { normalizeState, type Row } from "../model";
const row: Row = {
  ip: "1.1.1.1",
  status: "done",
  queriedAt: "",
  errors: [],
  city: "达累斯萨拉姆",
  country: "TZ",
  sections: [
    {
      sourceId: "ipradar",
      status: "ok",
      data: {
        city: { value: "Dar es Salaam", confidence: 90 },
        city_zh: "达累斯萨拉姆",
        country: { value: "TZ", confidence: 90 },
        threat: { verdict: "benign", confidence: 90 },
        classifications: {},
      },
    },
  ],
};
it("resolves browser language and falls back to English", () => {
  expect(normalizeState().settings.language).toBe("auto");
  for (const code of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant-US"])
    expect(resolveLanguage("auto", [code])).toBe("zh-Hant");
  for (const code of ["zh-CN", "zh-SG", "zh", "zh-Hans"])
    expect(resolveLanguage("auto", [code])).toBe("zh-Hans");
  expect(resolveLanguage("auto", ["ja", "en-GB"])).toBe("en");
  expect(resolveLanguage("auto", ["fr"])).toBe("en");
  expect(resolveLanguage("zh-Hant", ["en"])).toBe("zh-Hant");
});
it("keeps original city in simple view and bilingual source data in detail, including older records", () => {
  const simple = renderToStaticMarkup(<Results rows={[row]} />);
  expect(simple).toContain("Dar es Salaam");
  expect(simple).not.toContain("达累斯萨拉姆");
  const full = renderToStaticMarkup(<FullResult row={row} />);
  expect(full).toContain("Dar es Salaam（达累斯萨拉姆）");
});
it("localizes English and Simplified Chinese details and CSV headers without translating source cities", () => {
  const en = renderToStaticMarkup(
    <I18nContext.Provider value="en">
      <FullResult row={row} />
    </I18nContext.Provider>,
  );
  expect(en).toContain("Source details");
  expect(en).toContain("Benign");
  expect(en).toContain("Network information");
  expect(en).not.toContain("來源詳情");
  const hans = renderToStaticMarkup(
    <I18nContext.Provider value="zh-Hans">
      <FullResult row={row} />
    </I18nContext.Provider>,
  );
  expect(hans).toContain("来源详情");
  expect(toCsv([row], "en")).toContain(
    '"IP","Region code","City","AbuseIPDB score"',
  );
  expect(toCsv([row], "en")).toContain("Dar es Salaam");
});
