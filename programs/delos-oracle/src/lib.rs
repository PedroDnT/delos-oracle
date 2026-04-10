use anchor_lang::prelude::*;

declare_id!("6VsTr6k9EkNHhjDVjNn5yfbvjAqjozgSDDCstT1k2frc");

// ─── Rate type constants ───────────────────────────────────────────────────────
pub const SELIC: u8 = 0;
pub const CDI: u8 = 1;
pub const PTAX: u8 = 2;
pub const TR: u8 = 3;

#[program]
pub mod delos_oracle {
    use super::*;

    /// Create the oracle account. Called once by the authority.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        oracle.authority = ctx.accounts.authority.key();
        oracle.last_updated = Clock::get()?.unix_timestamp;
        msg!("Delos Oracle initialized. Authority: {}", oracle.authority);
        Ok(())
    }

    /// Update a single BCB daily rate.
    /// rate_type: 0=SELIC, 1=CDI, 2=PTAX, 3=TR
    /// value: rate × 10^8 (Chainlink-compatible)
    /// date: YYYYMMDD integer
    pub fn update_rate(
        ctx: Context<UpdateOracle>,
        rate_type: u8,
        value: i64,
        date: u32,
    ) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        let rate = Rate { value, date, _pad: 0 };
        match rate_type {
            SELIC => oracle.selic = rate,
            CDI   => oracle.cdi   = rate,
            PTAX  => oracle.ptax  = rate,
            TR    => oracle.tr    = rate,
            _     => return err!(DelosError::InvalidRateType),
        }
        oracle.last_updated = Clock::get()?.unix_timestamp;
        msg!("Rate {} updated: {} @ {}", rate_type, value, date);
        Ok(())
    }

    /// Batch update all 4 daily BCB rates in one transaction.
    /// Preferred over individual updates — cheaper and atomic.
    pub fn batch_update_rates(
        ctx: Context<UpdateOracle>,
        selic_value: i64, selic_date: u32,
        cdi_value:   i64, cdi_date:   u32,
        ptax_value:  i64, ptax_date:  u32,
        tr_value:    i64, tr_date:    u32,
    ) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        oracle.selic = Rate { value: selic_value, date: selic_date, _pad: 0 };
        oracle.cdi   = Rate { value: cdi_value,   date: cdi_date,   _pad: 0 };
        oracle.ptax  = Rate { value: ptax_value,  date: ptax_date,  _pad: 0 };
        oracle.tr    = Rate { value: tr_value,    date: tr_date,    _pad: 0 };
        oracle.last_updated = Clock::get()?.unix_timestamp;
        msg!("Batch update: SELIC={} CDI={} PTAX={} TR={}", selic_value, cdi_value, ptax_value, tr_value);
        Ok(())
    }

    /// Update Focus Boletim market expectations.
    /// All medians are scaled × 10^8.
    /// year: reference year (e.g. 2026)
    /// reference_date: date of Focus publication, YYYYMMDD
    pub fn update_focus(
        ctx: Context<UpdateOracle>,
        ipca_median:     i64,
        selic_eoy_median: i64,
        usd_brl_median:  i64,
        gdp_median:      i64,
        year:            u16,
        reference_date:  u32,
    ) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        oracle.focus_ipca     = FocusRate { median: ipca_median,     year, reference_date, _pad: 0 };
        oracle.focus_selic    = FocusRate { median: selic_eoy_median, year, reference_date, _pad: 0 };
        oracle.focus_usd_brl  = FocusRate { median: usd_brl_median,  year, reference_date, _pad: 0 };
        oracle.focus_gdp      = FocusRate { median: gdp_median,      year, reference_date, _pad: 0 };
        oracle.last_updated = Clock::get()?.unix_timestamp;
        msg!("Focus {} updated: IPCA={} SELIC_EOY={} USD/BRL={} GDP={}", year, ipca_median, selic_eoy_median, usd_brl_median, gdp_median);
        Ok(())
    }

    /// Transfer authority to a new pubkey (key rotation / multisig upgrade path).
    pub fn transfer_authority(
        ctx: Context<UpdateOracle>,
        new_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.oracle.authority = new_authority;
        msg!("Authority transferred to {}", new_authority);
        Ok(())
    }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = MacroOracle::SIZE,
        seeds = [b"oracle"],
        bump,
    )]
    pub oracle: Account<'info, MacroOracle>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle"],
        bump,
        has_one = authority @ DelosError::Unauthorized,
    )]
    pub oracle: Account<'info, MacroOracle>,
    pub authority: Signer<'info>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
#[derive(Default)]
pub struct MacroOracle {
    pub authority:    Pubkey,    // 32  — authorized publisher
    // Daily BCB rates
    pub selic:        Rate,      // 16  — SELIC overnight (SGS 432)
    pub cdi:          Rate,      // 16  — CDI rate (SGS 12)
    pub ptax:         Rate,      // 16  — USD/BRL PTAX (SGS 1)
    pub tr:           Rate,      // 16  — Referential rate (SGS 226)
    // Focus Boletim market expectations
    pub focus_ipca:    FocusRate, // 16 — IPCA expectation (current yr)
    pub focus_selic:   FocusRate, // 16 — SELIC end-of-year expectation
    pub focus_usd_brl: FocusRate, // 16 — USD/BRL expectation
    pub focus_gdp:     FocusRate, // 16 — GDP growth expectation
    pub last_updated: i64,        //  8 — Unix timestamp
}

impl MacroOracle {
    // 8 (discriminator) + 32 + 4×16 + 4×16 + 8 = 176 bytes
    pub const SIZE: usize = 8 + 32 + 4 * 16 + 4 * 16 + 8;
}

/// A BCB point-in-time rate, value scaled ×10^8, date as YYYYMMDD.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct Rate {
    pub value: i64,  // e.g. SELIC 10.5% → 1050000000
    pub date:  u32,  // e.g. 20260410
    pub _pad:  u32,  // alignment padding
}

/// A Focus Boletim market expectation (median), scaled ×10^8.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct FocusRate {
    pub median:         i64, // e.g. IPCA 4.5% → 450000000
    pub year:           u16, // reference year, e.g. 2026
    pub reference_date: u32, // Focus publication date YYYYMMDD
    pub _pad:           u16, // alignment padding
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum DelosError {
    #[msg("Unauthorized: signer is not the oracle authority")]
    Unauthorized,
    #[msg("Invalid rate type. Use 0=SELIC, 1=CDI, 2=PTAX, 3=TR")]
    InvalidRateType,
}
