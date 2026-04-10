import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { DelosOracle } from "../../target/types/delos_oracle";

describe("delos-oracle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DelosOracle as Program<DelosOracle>;
  const authority = provider.wallet as anchor.Wallet;

  const [oraclePda, oracleBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("oracle")],
    program.programId
  );

  // ── Initialize ─────────────────────────────────────────────────────────────

  it("initializes the oracle account", async () => {
    await program.methods
      .initialize()
      .accounts({
        oracle:        oraclePda,
        authority:     authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const oracle = await program.account.macroOracle.fetch(oraclePda);
    assert.ok(oracle.authority.equals(authority.publicKey), "authority mismatch");
    assert.ok(oracle.lastUpdated.gt(new anchor.BN(0)), "lastUpdated not set");
    console.log("  Oracle PDA:", oraclePda.toBase58());
  });

  // ── Update single rate ─────────────────────────────────────────────────────

  it("updates SELIC rate (rate_type=0)", async () => {
    const value = new anchor.BN(1_050_000_000); // 10.5%
    const date  = 20260410;

    await program.methods
      .updateRate(0, value, date)
      .accounts({ oracle: oraclePda, authority: authority.publicKey })
      .rpc();

    const oracle = await program.account.macroOracle.fetch(oraclePda);
    assert.ok(oracle.selic.value.eq(value), "SELIC value mismatch");
    assert.equal(oracle.selic.date, date, "SELIC date mismatch");
  });

  it("rejects invalid rate_type", async () => {
    try {
      await program.methods
        .updateRate(99, new anchor.BN(0), 0)
        .accounts({ oracle: oraclePda, authority: authority.publicKey })
        .rpc();
      assert.fail("Should have thrown InvalidRateType");
    } catch (err: unknown) {
      assert.include(String(err), "InvalidRateType");
    }
  });

  // ── Batch update ───────────────────────────────────────────────────────────

  it("batch updates all 4 daily rates atomically", async () => {
    const selicVal  = new anchor.BN(1_050_000_000);
    const cdiVal    = new anchor.BN(1_045_000_000);
    const ptaxVal   = new anchor.BN(   520_000_000);
    const trVal     = new anchor.BN(   100_000_000);
    const date      = 20260410;

    await program.methods
      .batchUpdateRates(
        selicVal, date,
        cdiVal,   date,
        ptaxVal,  date,
        trVal,    date,
      )
      .accounts({ oracle: oraclePda, authority: authority.publicKey })
      .rpc();

    const oracle = await program.account.macroOracle.fetch(oraclePda);
    assert.ok(oracle.selic.value.eq(selicVal));
    assert.ok(oracle.cdi.value.eq(cdiVal));
    assert.ok(oracle.ptax.value.eq(ptaxVal));
    assert.ok(oracle.tr.value.eq(trVal));
    assert.equal(oracle.selic.date, date);
  });

  // ── Focus update ───────────────────────────────────────────────────────────

  it("updates Focus Boletim expectations", async () => {
    const ipcaMedian    = new anchor.BN(450_000_000); // 4.5%
    const selicEoy      = new anchor.BN(1_025_000_000); // 10.25%
    const usdBrl        = new anchor.BN(520_000_000); // 5.20
    const gdp           = new anchor.BN(200_000_000); // 2.00%
    const year          = 2026;
    const referenceDate = 20260407;

    await program.methods
      .updateFocus(ipcaMedian, selicEoy, usdBrl, gdp, year, referenceDate)
      .accounts({ oracle: oraclePda, authority: authority.publicKey })
      .rpc();

    const oracle = await program.account.macroOracle.fetch(oraclePda);
    assert.ok(oracle.focusIpca.median.eq(ipcaMedian));
    assert.ok(oracle.focusSelic.median.eq(selicEoy));
    assert.ok(oracle.focusUsdBrl.median.eq(usdBrl));
    assert.ok(oracle.focusGdp.median.eq(gdp));
    assert.equal(oracle.focusIpca.year, year);
    assert.equal(oracle.focusIpca.referenceDate, referenceDate);
  });

  // ── Authority enforcement ──────────────────────────────────────────────────

  it("rejects update from unauthorized signer", async () => {
    const intruder = anchor.web3.Keypair.generate();

    // Airdrop enough SOL for the TX fee
    await provider.connection.requestAirdrop(intruder.publicKey, 1e9);
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await program.methods
        .batchUpdateRates(
          new anchor.BN(0), 0,
          new anchor.BN(0), 0,
          new anchor.BN(0), 0,
          new anchor.BN(0), 0,
        )
        .accounts({ oracle: oraclePda, authority: intruder.publicKey })
        .signers([intruder])
        .rpc();
      assert.fail("Should have thrown Unauthorized");
    } catch (err: unknown) {
      assert.include(String(err), "Unauthorized");
    }
  });

  // ── Transfer authority ─────────────────────────────────────────────────────

  it("transfers authority to a new key", async () => {
    const newAuthority = anchor.web3.Keypair.generate();

    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accounts({ oracle: oraclePda, authority: authority.publicKey })
      .rpc();

    const oracle = await program.account.macroOracle.fetch(oraclePda);
    assert.ok(oracle.authority.equals(newAuthority.publicKey));

    // Transfer back so other tests continue to work
    await program.methods
      .transferAuthority(authority.publicKey)
      .accounts({ oracle: oraclePda, authority: newAuthority.publicKey })
      .signers([newAuthority])
      .rpc();
  });
});
