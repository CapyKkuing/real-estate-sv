export type OfficialDataMode = "demo"

import { createHistoryProgress, listRecentMonths } from "./history-query"
import { parseTransactionQuery } from "./transaction-query"

const DEMO_LEGAL_DONG_CODE = "1153010200"

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof Request) return new URL(input.url)
  return new URL(String(input))
}

function dealDate(url: URL) {
  const dealYmd = url.searchParams.get("DEAL_YMD") ?? "202606"
  return {
    year: /^\d{6}$/.test(dealYmd) ? dealYmd.slice(0, 4) : "2026",
    month: /^\d{6}$/.test(dealYmd) ? String(Number(dealYmd.slice(4, 6))) : "6",
  }
}

function molitPayload(url: URL, rent: boolean) {
  const { year, month } = dealDate(url)
  const lawdCd = url.searchParams.get("LAWD_CD") ?? "11530"
  const item = rent
    ? [
        {
          sggCd: lawdCd,
          umdNm: "더미동",
          aptNm: "개발용 샘플아파트",
          jibun: "719",
          excluUseAr: "84.97",
          dealYear: year,
          dealMonth: month,
          dealDay: "18",
          deposit: "45,000",
          monthlyRent: "0",
          floor: "12",
          buildYear: "2018",
          contractTerm: "2년",
          contractType: "신규",
          useRRRight: "미사용",
          preDeposit: "0",
          preMonthlyRent: "0",
        },
        {
          sggCd: lawdCd,
          umdNm: "더미동",
          aptNm: "개발용 샘플아파트",
          jibun: "719",
          excluUseAr: "59.91",
          dealYear: year,
          dealMonth: month,
          dealDay: "12",
          deposit: "10,000",
          monthlyRent: "95",
          floor: "8",
          buildYear: "2018",
          contractTerm: "2년",
          contractType: "갱신",
          useRRRight: "사용",
          preDeposit: "8,000",
          preMonthlyRent: "85",
        },
      ]
    : [
        {
          sggCd: lawdCd,
          umdNm: "더미동",
          aptNm: "개발용 샘플아파트",
          jibun: "719",
          excluUseAr: "84.97",
          dealAmount: "54,500",
          dealYear: year,
          dealMonth: month,
          dealDay: "18",
          floor: "12",
          buildYear: "2018",
          buildingType: "공동주택",
          cdealType: "",
          cdealDay: "",
        },
        {
          sggCd: lawdCd,
          umdNm: "더미동",
          aptNm: "개발용 샘플아파트",
          jibun: "719",
          excluUseAr: "59.91",
          dealAmount: "42,000",
          dealYear: year,
          dealMonth: month,
          dealDay: "11",
          floor: "8",
          buildYear: "2018",
          buildingType: "공동주택",
          cdealType: "",
          cdealDay: "",
        },
      ]

  return {
    response: {
      header: { resultCode: "000", resultMsg: "NORMAL SERVICE." },
      body: { items: { item }, numOfRows: item.length, pageNo: 1, totalCount: item.length },
    },
  }
}

function legalDongPayload(address: string) {
  return {
    StanReginCd: [
      { head: [{ totalCount: 1 }, { result: { resultCode: "INFO-0" } }] },
      { row: [{ region_cd: DEMO_LEGAL_DONG_CODE, locatadd_nm: address }] },
    ],
  }
}

function buildingPayload() {
  return {
    response: {
      header: { resultCode: "000" },
      body: {
        items: {
          item: [{
            mgmBldrgstPk: "DEMO-11530-0001",
            bldNm: "개발용 샘플아파트",
            mainPurpsCdNm: "공동주택",
            totArea: "12345.67",
            grndFlrCnt: "18",
            ugrndFlrCnt: "2",
            useAprDay: "20180314",
            bcRat: "34.28",
            vlRat: "249.70",
          }],
        },
      },
    },
  }
}

function landUsePayload(pnu: string) {
  return {
    landUses: {
      field: [
        {
          pnu,
          regstrSeCode: "1",
          regstrSeCodeNm: "토지대장",
          prposAreaDstrcCode: "UQA220",
          prposAreaDstrcCodeNm: "일반상업지역",
          lastUpdtDt: "2026-07-29",
        },
        {
          pnu,
          regstrSeCode: "1",
          regstrSeCodeNm: "토지대장",
          prposAreaDstrcCode: "UDA100",
          prposAreaDstrcCodeNm: "재정비촉진지구",
          lastUpdtDt: "2026-07-29",
        },
      ],
    },
  }
}

function ordinanceSearchPayload(jurisdictionName: string) {
  return {
    LawSearch: {
      law: [{
        자치법규명: `개발용 더미 ${jurisdictionName} 도시계획 조례`,
        자치법규ID: "DEMO-001",
        시행일자: "20260729",
        지자체기관명: jurisdictionName,
      }],
    },
  }
}

function ordinanceBodyPayload() {
  return {
    ordinance: {
      자치법규명: "개발용 더미 도시계획 조례",
      시행일자: "20260729",
      조문: [{
        조문번호: "제55조",
        조내용: "일반상업지역은 건폐율 70퍼센트 이하, 용적률 800퍼센트 이하로 한다.",
      }],
    },
  }
}

export function isDemoOfficialDataMode(value: string | undefined): value is OfficialDataMode {
  return value === "demo"
}

export function handleDemoHistoryRequest(request: Request): Response {
  if (request.method !== "GET") {
    return Response.json(
      { error: "허용되지 않은 요청 방식입니다." },
      { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } },
    )
  }

  const query = parseTransactionQuery(new URL(request.url))
  if (!query) {
    return Response.json(
      { error: "요청 값을 확인해 주세요." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const months = listRecentMonths(query.dealYmd)
  return Response.json(
    {
      query: {
        propertyType: query.propertyType,
        lawdCd: query.lawdCd,
        fromDealYmd: months.at(-1),
        toDealYmd: query.dealYmd,
      },
      progress: createHistoryProgress(months, [], 3),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export function createDemoOfficialFetch(): typeof fetch {
  return async (input) => {
    const url = requestUrl(input)
    if (url.hostname === "apis.data.go.kr") {
      if (url.pathname.endsWith("/StanReginCd/getStanReginCdList")) {
        return Response.json(legalDongPayload(url.searchParams.get("locatadd_nm") ?? "개발용 주소"))
      }
      if (url.pathname.endsWith("/BldRgstHubService/getBrTitleInfo")) return Response.json(buildingPayload())
      return Response.json(molitPayload(url, url.pathname.includes("Rent")))
    }
    if (url.hostname === "api.vworld.kr" && url.pathname === "/ned/data/getLandUseAttr") {
      return Response.json(landUsePayload(url.searchParams.get("pnu") ?? "1153010200100719000"))
    }
    if (url.hostname === "www.law.go.kr" && url.pathname.endsWith("/lawSearch.do")) {
      const query = url.searchParams.get("query") ?? "개발용 지역"
      const jurisdictionName = query.replace(/\s*도시계획 조례$/, "")
      return Response.json(ordinanceSearchPayload(jurisdictionName))
    }
    if (url.hostname === "www.law.go.kr" && url.pathname.endsWith("/lawService.do")) {
      return Response.json(ordinanceBodyPayload())
    }
    return new Response("Not Found", { status: 404 })
  }
}
