/**
 * Rotate BrazilianMacroOracle roles onto a new admin key.
 *
 * The oracle uses plain OpenZeppelin AccessControl, so authority can be moved
 * entirely on-chain — no redeploy, and the stored rate history is preserved.
 *
 * Run it twice, once from each key, because the second half must be signed by
 * the incoming account:
 *
 *   # 1. signed by the OLD key — hands DEFAULT_ADMIN_ROLE to the new address
 *   PRIVATE_KEY=<old> NEW_ADMIN=0x... ORACLE_ADDRESS=0x... \
 *     npx hardhat run scripts/rotate-roles.ts --network arbitrumSepolia
 *
 *   # 2. signed by the NEW key — takes the remaining roles and revokes the old
 *   PRIVATE_KEY=<new> OLD_ADMIN=0x... ORACLE_ADDRESS=0x... \
 *     npx hardhat run scripts/rotate-roles.ts --network arbitrumSepolia
 *
 * Order matters: every role is granted to the new account before anything is
 * revoked from the old one, and DEFAULT_ADMIN_ROLE is revoked last. Revoking
 * it early would strip the caller of the authority needed for the rest.
 */

import { network } from "hardhat";

async function main() {
  const oracleAddress = required("ORACLE_ADDRESS");
  const newAdmin = process.env.NEW_ADMIN;
  const oldAdmin = process.env.OLD_ADMIN;

  if (!newAdmin && !oldAdmin) {
    throw new Error("Set NEW_ADMIN (grant phase) or OLD_ADMIN (revoke phase)");
  }

  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();
  const oracle = await ethers.getContractAt("BrazilianMacroOracle", oracleAddress);

  const DEFAULT_ADMIN_ROLE = await oracle.DEFAULT_ADMIN_ROLE();
  const ADMIN_ROLE = await oracle.ADMIN_ROLE();
  const UPDATER_ROLE = await oracle.UPDATER_ROLE();
  const roles = [
    ["DEFAULT_ADMIN_ROLE", DEFAULT_ADMIN_ROLE],
    ["ADMIN_ROLE", ADMIN_ROLE],
    ["UPDATER_ROLE", UPDATER_ROLE],
  ] as const;

  console.log(`oracle:  ${oracleAddress}`);
  console.log(`signer:  ${signer.address}`);

  if (!(await oracle.hasRole(DEFAULT_ADMIN_ROLE, signer.address))) {
    throw new Error(
      `${signer.address} does not hold DEFAULT_ADMIN_ROLE — it cannot grant or revoke.`
    );
  }

  if (newAdmin) {
    console.log(`\ngranting all roles to ${newAdmin}`);
    for (const [name, role] of roles) {
      if (await oracle.hasRole(role, newAdmin)) {
        console.log(`  ${name}: already held, skipping`);
        continue;
      }
      const tx = await oracle.grantRole(role, newAdmin);
      await tx.wait();
      console.log(`  ${name}: granted (${tx.hash})`);
    }
  }

  if (oldAdmin) {
    if (oldAdmin.toLowerCase() === signer.address.toLowerCase()) {
      throw new Error("OLD_ADMIN must not be the signer — that would lock you out.");
    }
    // Revoke in reverse order of privilege so DEFAULT_ADMIN_ROLE goes last.
    console.log(`\nrevoking all roles from ${oldAdmin}`);
    for (const [name, role] of [...roles].reverse()) {
      if (!(await oracle.hasRole(role, oldAdmin))) {
        console.log(`  ${name}: not held, skipping`);
        continue;
      }
      const tx = await oracle.revokeRole(role, oldAdmin);
      await tx.wait();
      console.log(`  ${name}: revoked (${tx.hash})`);
    }
  }

  console.log("\nfinal state:");
  for (const [name, role] of roles) {
    const parts: string[] = [];
    if (newAdmin) parts.push(`new=${await oracle.hasRole(role, newAdmin)}`);
    if (oldAdmin) parts.push(`old=${await oracle.hasRole(role, oldAdmin)}`);
    console.log(`  ${name}: ${parts.join("  ")}`);
  }

  if (oldAdmin) {
    const stillHeld = [];
    for (const [name, role] of roles) {
      if (await oracle.hasRole(role, oldAdmin)) stillHeld.push(name);
    }
    if (stillHeld.length) {
      throw new Error(`old admin still holds: ${stillHeld.join(", ")}`);
    }
    console.log("\nold admin holds no roles — rotation complete.");
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
