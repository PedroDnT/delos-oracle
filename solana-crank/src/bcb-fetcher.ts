import axios from "axios";

const BCB_SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

interface SgsRecord {
  data: string;  // DD/MM/YYYY
  valor: string;
}

async function fetchLatest(series: number): Promise<SgsRecord> {
  const url = `${BCB_SGS}.${series}/dados/ultimos/1?formato=json`;
  const res = await axios.get<SgsRecord[]>(url, { timeout: 10_000 });
  if (!res.data?.length) throw new Error(`BCB SGS ${series}: empty response`);
  return res.data[0];
}

/** Scale a BCB decimal string to ×10^8 integer (Chainlink-compatible). */
function scale(valor: string): number {
  return Math.round(parseFloat(valor.replace(",", ".")) * 1e8);
}

/** Convert DD/MM/YYYY → YYYYMMDD integer. */
function toDate(data: string): number {
  const [d, m, y] = data.split("/");
  return parseInt(`${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`);
}

export interface RatePoint {
  value: number; // scaled ×10^8
  date: number;  // YYYYMMDD
  raw: string;   // original BCB value
}

export interface BcbRates {
  selic: RatePoint;
  cdi:   RatePoint;
  ptax:  RatePoint;
  tr:    RatePoint;
}

export async function fetchBcbRates(): Promise<BcbRates> {
  const [selic, cdi, ptax, tr] = await Promise.all([
    fetchLatest(432), // SELIC meta
    fetchLatest(12),  // CDI
    fetchLatest(1),   // PTAX USD/BRL
    fetchLatest(226), // TR
  ]);

  return {
    selic: { value: scale(selic.valor), date: toDate(selic.data), raw: selic.valor },
    cdi:   { value: scale(cdi.valor),   date: toDate(cdi.data),   raw: cdi.valor   },
    ptax:  { value: scale(ptax.valor),  date: toDate(ptax.data),  raw: ptax.valor  },
    tr:    { value: scale(tr.valor),    date: toDate(tr.data),    raw: tr.valor    },
  };
}
