import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fetchBcbRates } from "./bcb-fetcher";
import { fetchFocusBulletin } from "./focus-fetcher";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL    = process.env.RPC_URL    ?? "https://api.devnet.solana.com";
const KEY_PATH   = process.env.KEY_PATH   ?? `${process.env.HOME}/.config/solana/id.json`;
const PROGRAM_ID = process.env.PROGRAM_ID ?? "DeLoSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const DRY_RUN    = process.env.DRY_RUN    === "true";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl(): anchor.Idl {
  const idlPath = path.resolve(__dirname, "../../target/idl/delos_oracle.json");
  return JSON.parse(fs.readFileSync(idlPath, "utf-8")) as anchor.Idl;
}

function isStale(onChainDate: number, bcbDate: number): boolean {
  return onChainDate < bcbDate;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📡 Delos Oracle Publisher`);
  console.log(`   RPC:      ${RPC_URL}`);
  console.log(`   Program:  ${PROGRAM_ID}`);
  console.log(`   Dry run:  ${DRY_RUN}\n`);

  const keypair   = loadKeypair(KEY_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet    = new Wallet(keypair);
  const provider  = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl     = loadIdl();
  const program = new Program(idl, new PublicKey(PROGRAM_ID), provider);

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle")],
    program.programId
  );

  // ── Read on-chain state for staleness check ──────────────────────────────
  let onChain: { selic: { date: number }; cdi: { date: number }; focus_ipca: { referenceDate: number } } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onChain = await (program.account as any).macroOracle.fetch(oraclePda);
    console.log(`✓ Oracle account found: ${oraclePda.toBase58()}`);
  } catch {
    console.log(`⚠ Oracle account not found — run 'anchor run initialize' first`);
    process.exit(1);
  }

  // ── Fetch BCB data ────────────────────────────────────────────────────────
  console.log("Fetching BCB rates...");
  const rates = await fetchBcbRates();
  console.log(`  SELIC ${rates.selic.raw}% @ ${rates.selic.date}`);
  console.log(`  CDI   ${rates.cdi.raw}%   @ ${rates.cdi.date}`);
  console.log(`  PTAX  ${rates.ptax.raw}   @ ${rates.ptax.date}`);
  console.log(`  TR    ${rates.tr.raw}%    @ ${rates.tr.date}`);

  // ── Batch update daily rates ──────────────────────────────────────────────
  const ratesStale = isStale(onChain?.selic?.date ?? 0, rates.selic.date);
  if (ratesStale) {
    console.log("\nPosting daily rates...");
    if (!DRY_RUN) {
      const tx = await program.methods
        .batchUpdateRates(
          new anchor.BN(rates.selic.value), rates.selic.date,
          new anchor.BN(rates.cdi.value),   rates.cdi.date,
          new anchor.BN(rates.ptax.value),  rates.ptax.date,
          new anchor.BN(rates.tr.value),    rates.tr.date,
        )
        .accounts({ oracle: oraclePda, authority: keypair.publicKey })
        .rpc();
      console.log(`✓ Daily rates TX: ${tx}`);
    } else {
      console.log("  (dry run — skipping TX)");
    }
  } else {
    console.log("  Daily rates already current — skipping");
  }

  // ── Fetch Focus Boletim ───────────────────────────────────────────────────
  console.log("\nFetching Focus Boletim...");
  const focus = await fetchFocusBulletin();
  console.log(`  IPCA expectation  ${focus.ipca.raw}%    (${focus.year})`);
  console.log(`  SELIC EOY         ${focus.selicEoy.raw}%  (${focus.year})`);
  console.log(`  USD/BRL           ${focus.usdBrl.raw}    (${focus.year})`);
  console.log(`  GDP               ${focus.gdp.raw}%    (${focus.year})`);
  console.log(`  Reference date:   ${focus.referenceDate}`);

  const focusStale = isStale(onChain?.focus_ipca?.referenceDate ?? 0, focus.referenceDate);
  if (focusStale) {
    console.log("\nPosting Focus bulletin...");
    if (!DRY_RUN) {
      const tx = await program.methods
        .updateFocus(
          new anchor.BN(focus.ipca.median),
          new anchor.BN(focus.selicEoy.median),
          new anchor.BN(focus.usdBrl.median),
          new anchor.BN(focus.gdp.median),
          focus.year,
          focus.referenceDate,
        )
        .accounts({ oracle: oraclePda, authority: keypair.publicKey })
        .rpc();
      console.log(`✓ Focus TX: ${tx}`);
    } else {
      console.log("  (dry run — skipping TX)");
    }
  } else {
    console.log("  Focus bulletin already current — skipping");
  }

  console.log("\n✅ Done\n");
}

main().catch((err) => {
  console.error("❌ Publisher error:", err);
  process.exit(1);
});
