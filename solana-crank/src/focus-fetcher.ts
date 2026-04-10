import axios from "axios";

const FOCUS_URL =
  "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais";

interface FocusRecord {
  Indicador: string;
  Data: string;          // YYYY-MM-DD (report date)
  DataReferencia: string; // "2026" (year string)
  Mediana: number;
}

function scale(value: number): number {
  return Math.round(value * 1e8);
}

function isoToDate(iso: string): number {
  return parseInt(iso.replace(/-/g, ""));
}

async function fetchLatestExpectation(
  indicator: string,
  year: number
): Promise<FocusRecord | null> {
  const res = await axios.get<{ value: FocusRecord[] }>(FOCUS_URL, {
    timeout: 10_000,
    params: {
      $filter:  `Indicador eq '${indicator}' and DataReferencia eq '${year}'`,
      $orderby: "Data desc",
      $top:     1,
      $format:  "json",
      $select:  "Indicador,Data,DataReferencia,Mediana",
    },
  });
  return res.data.value[0] ?? null;
}

export interface FocusPoint {
  median: number; // scaled ×10^8
  raw: number;    // original value
}

export interface FocusBulletin {
  ipca:     FocusPoint;
  selicEoy: FocusPoint;
  usdBrl:   FocusPoint;
  gdp:      FocusPoint;
  year: number;
  referenceDate: number; // YYYYMMDD of the Focus report
}

export async function fetchFocusBulletin(): Promise<FocusBulletin> {
  const year = new Date().getFullYear();

  // BCB Focus indicator names (exact match required)
  const [ipca, selic, usdBrl, gdp] = await Promise.all([
    fetchLatestExpectation("IPCA", year),
    fetchLatestExpectation("Selic", year),
    fetchLatestExpectation("Câmbio", year),
    fetchLatestExpectation("PIB Total", year),
  ]);

  if (!ipca || !selic || !usdBrl || !gdp) {
    throw new Error("Incomplete Focus bulletin — one or more indicators missing");
  }

  return {
    ipca:     { median: scale(ipca.Mediana),   raw: ipca.Mediana   },
    selicEoy: { median: scale(selic.Mediana),  raw: selic.Mediana  },
    usdBrl:   { median: scale(usdBrl.Mediana), raw: usdBrl.Mediana },
    gdp:      { median: scale(gdp.Mediana),    raw: gdp.Mediana    },
    year,
    referenceDate: isoToDate(ipca.Data),
  };
}
