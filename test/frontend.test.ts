import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Cloudflare frontend", () => {
  it("uses only the same-origin API and contains no public service key or legacy proxy", async () => {
    const script = await readFile(resolve("site/main.js"), "utf8")

    expect(script).toContain("/api/real-estate")
    expect(script).not.toMatch(/const\s+SERVICE_KEY/)
    expect(script).not.toContain("onrender.com")
    expect(script).not.toContain("cors-anywhere")
    expect(script).not.toContain("proxy?url=")
    expect(script).not.toContain("serviceKey=")
  })

  it("publishes dashboard-friendly Open Graph metadata and a 1200x630 thumbnail", async () => {
    const [html, image] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/real-estate-pro-og.png")),
    ])

    expect(html).toContain('<meta property="og:title"')
    expect(html).toContain('<meta property="og:image" content="/real-estate-pro-og.png"')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
    expect(image.subarray(1, 4).toString("ascii")).toBe("PNG")
    expect(image.readUInt32BE(16)).toBe(1200)
    expect(image.readUInt32BE(20)).toBe(630)
  })

  it("declares a favicon asset instead of triggering the browser fallback request", async () => {
    const [html, favicon] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/favicon.svg"), "utf8"),
    ])

    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">')
    expect(favicon).toContain("<svg")
  })

  it("includes the analysis dashboard controls and inline status surfaces", async () => {
    const [html, script] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/main.js"), "utf8"),
    ])

    for (const id of ["theme-toggle", "query-status", "period-select", "stat-total", "stat-median", "stat-average", "stat-valid", "stat-cancelled", "trend-bars", "trend-summary", "sort-select", "export-csv-btn", "columns-toggle", "columns-menu", "detail-panel", "detail-pnu", "detail-building", "detail-land-use", "detail-ordinance", "detail-source", "detail-history-list"]) {
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('data-theme="light"')
    expect(script).toContain("renderMetrics")
    expect(script).toContain("escapeHtml")
    expect(script).toContain('data-action="detail"')
    expect(script).toContain("sortTransactions")
    expect(script).toContain("exportCsv")
    expect(script).toContain("syncColumnVisibility")
    expect(script).toContain("국토교통부 실거래가 Open API")
    expect(script).toContain("realEstateTheme")
    expect(script).toContain("setQueryStatus")
    expect(script).toContain("prepareDongOptions")
    expect(script).toContain("loadHistoryTrend")
    expect(script).toContain("fetchSingleRentType")
    expect(script).toContain("loadDetailPnu")
    expect(script).toContain("loadDetailBuilding")
    expect(script).toContain("loadDetailLandUse")
    expect(script).toContain("loadDetailOrdinance")
    expect(script).toContain("isDemoDataResponse")
    expect(script).toContain("개발용 더미 데이터")
    expect(script).toContain("isAnalysisReady")
    expect(html).toContain('<input type="checkbox" name="type" value="apt" checked>')
    expect(html).toContain('<input type="checkbox" name="transaction-mode" value="trade" checked>')
    expect(html).toContain('id="detail-renewal-right"')
    expect(html).toContain('<select id="gugun-select" disabled>')
    expect(html).toContain('<select id="date-select" disabled>')
    expect(html).toContain('<select id="dong-select" disabled>')
    expect(html).toContain('읍·면·동 <small>선택</small>')
    expect(html).toContain('id="fetch-live-btn" class="primary-button" type="button" disabled')
    expect(html).toContain('최근 조회 <b id="update-time">')
    expect(html).not.toContain('최근 업데이트 <b id="update-time">')
  })

  it("provides an accessible map-first entry and housing question surface", async () => {
    const [html, entryStyle, script, mainScript, transactionMapScript] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/entry.css"), "utf8"),
      readFile(resolve("site/entry-experience.js"), "utf8"),
      readFile(resolve("site/main.js"), "utf8"),
      readFile(resolve("site/transaction-map.js"), "utf8"),
    ])

    for (const id of [
      "entry-view",
      "entry-map",
      "entry-map-status",
      "entry-home-overlay",
      "housing-question-dialog",
      "housing-question-progress",
      "housing-question-title",
      "housing-question-body",
      "housing-question-close",
      "housing-question-previous",
      "housing-question-next",
      "housing-summary-bar",
      "housing-summary-chips",
      "housing-summary-transaction",
    ]) expect(html).toContain(`id="${id}"`)

    expect(html.match(/data-entry-route="housing"/g)).toHaveLength(2)
    expect(html.match(/data-entry-route="map"/g)).toHaveLength(2)
    expect(html).toContain("조건과 시세를 함께 보고, 살 곳을 정하세요.")
    expect(html).toContain('aria-modal="false"')
    expect(html).toContain('aria-live="polite"')
    expect(entryStyle).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))")
    expect(entryStyle).toMatch(/\.housing-question\s*\{[\s\S]*left:\s*50%[\s\S]*translate\(-50%,\s*-50%\)/)
    expect(entryStyle).toMatch(/\.housing-question-title:focus-visible[\s\S]*outline:\s*3px/)
    expect(entryStyle).toMatch(/\.housing-question-title\[data-focus-origin="pointer"\]:focus-visible[\s\S]*outline:\s*none/)
    expect(entryStyle).not.toMatch(/\.housing-question-title:focus(?!-visible)/)
    expect(entryStyle).toMatch(/@media \(max-width: 720px\)[\s\S]*bottom:\s*0/)
    const routeButtonStyle = entryStyle.match(/\.entry-route button \{([^}]*)\}/)?.[1] ?? ""
    expect(routeButtonStyle).toContain("width: 100%")
    expect(routeButtonStyle).toContain("justify-content: space-between")
    expect(entryStyle).toMatch(/@media \(max-width: 720px\)[\s\S]*grid-template-columns: 1fr/)
    expect(script).toContain("preventScroll: true")
    expect(script).toContain("getHousingSummaryChips")
    expect(entryStyle).toContain(".housing-summary-bar")
    expect(mainScript).toContain("onRegionChange")
    expect(mainScript).toContain("onOpenTransaction")
    expect(mainScript).toContain("toStoredPreferredRegion")
    const persistRegion = mainScript.match(/function persistEntryRegion\(region\) \{([\s\S]*?)\n\}/)?.[1] ?? ""
    expect(persistRegion).toContain("loadHousingProfile")
    expect(persistRegion).toContain("answerHousingQuestion")
    expect(persistRegion).toContain("saveHousingProfile")
    const openTransaction = mainScript.match(/function rememberTransactionRegion\(region\) \{([\s\S]*?)\n\}/)?.[1] ?? ""
    expect(openTransaction).toContain("toStoredPreferredRegion")
    expect(openTransaction).not.toMatch(/fetch\(|fetchBtn\.click|dispatchEvent|sidoSelect\.value|gugunSelect\.value/)
    expect(transactionMapScript).toContain("applyEntryRegion")
    expect(transactionMapScript).toContain("subscribeTransactionMap")
    expect(mainScript).toContain("runAnalysis")
    expect(mainScript).toContain("consumePendingTransactionRegion")
  })

  it("provides four stable scroll-map scene triggers", async () => {
    const [html, style] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/entry.css"), "utf8"),
    ])

    expect(html).toContain('id="entry-map-stage"')
    expect(html).toContain('id="entry-skip-dong"')
    for (const id of ["country", "sido", "sigungu", "dong"]) {
      expect(html).toContain(`data-map-scene="${id}"`)
      expect(html).toContain(`id="entry-scene-${id}"`)
    }
    expect(style).toMatch(/\.entry-map-stage\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*min-height:\s*100svh/s)
  })

  it("provides a responsive transaction panel inside the existing map stage", async () => {
    const [html, style] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/transaction-map.css"), "utf8"),
    ])

    for (const id of ["transaction-map-panel", "transaction-map-sheet-toggle", "transaction-map-region", "transaction-map-count", "transaction-map-filters", "transaction-map-list"]) {
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-live="polite"')
    expect(style).toMatch(/\.entry-map-stage\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(320px,\s*380px\)/)
    expect(style).toMatch(/@media \(max-width:\s*720px\)[\s\S]*\.transaction-map-panel\s*\{[\s\S]*position:\s*fixed[\s\S]*bottom:\s*0/)
    expect(style).toMatch(/\.transaction-map-panel\.is-collapsed[\s\S]*\.transaction-map-filters[\s\S]*display:\s*none/)
  })

  it("keeps the housing question dialog outside the hidden scene container", async () => {
    const html = await readFile(resolve("site/index.html"), "utf8")
    const entryMainStart = html.indexOf('<main id="entry-main"')
    const entryMainEnd = html.indexOf("</main>", entryMainStart)
    const dialogStart = html.indexOf('<aside id="housing-question-dialog"')

    expect(entryMainStart).toBeGreaterThanOrEqual(0)
    expect(dialogStart).toBeGreaterThan(entryMainStart)
    expect(dialogStart).toBeLessThan(entryMainEnd)
    expect(html.slice(0, dialogStart)).toMatch(/<\/section>\s*<\/div>\s*$/)
  })

  it("provides an accessible three-target comparison surface", async () => {
    const [html, script, comparison, style] = await Promise.all([
      readFile(resolve("site/index.html"), "utf8"),
      readFile(resolve("site/main.js"), "utf8"),
      readFile(resolve("site/comparison.js"), "utf8"),
      readFile(resolve("site/style.css"), "utf8"),
    ])

    for (const id of ["comparison-section", "add-comparison-btn", "comparison-status", "comparison-table-body"]) {
      expect(html).toContain(`id="${id}"`)
    }
    expect(script).toContain("initComparison")
    expect(comparison).toContain("addCurrentComparison")
    expect(comparison).toContain("renderComparison")
    expect(style).toContain(".comparison-table-shell")
    expect(style).toMatch(/@media \(max-width: 720px\)[\s\S]*\.comparison-table-shell/)
  })

  it("preserves the detail action when inline price analysis is toggled", async () => {
    const script = await readFile(resolve("site/main.js"), "utf8")
    const analyzeFunction = script.match(/function runInlineAnalysis[\s\S]*?\n}/)?.[0] ?? ""
    const resetFunction = script.match(/function resetRow[\s\S]*?\n}/)?.[0] ?? ""

    expect(analyzeFunction).toContain("const detailAction")
    expect(analyzeFunction).toContain("${detailAction}")
    expect(resetFunction).toContain("const detailAction")
    expect(resetFunction).toContain("${detailAction}")
  })
})
