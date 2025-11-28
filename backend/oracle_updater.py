"""
Oracle Updater - Web3 Integration
Updates BrazilianMacroOracle on Arbitrum Sepolia with BCB data.

Chainlink Standard: 8 decimals for all fiat feeds
- 4.50% → 450000000 (4.5 × 10^8)
- 10.90% → 1090000000 (10.9 × 10^8)
"""

import asyncio
import logging
import json
import os
from typing import Optional, Dict, List, Tuple
from pathlib import Path
from dataclasses import dataclass

from web3 import AsyncWeb3
from web3.exceptions import ContractLogicError
from eth_account import Account
from dotenv import load_dotenv

from bcb_client import BCBClient, RateType, RateData, CHAINLINK_DECIMALS

# Load .env from contracts directory (shared config)
ENV_PATH = Path(__file__).parent.parent / "contracts" / ".env"
load_dotenv(ENV_PATH)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PRECISION = 10 ** CHAINLINK_DECIMALS  # 10^8


@dataclass
class UpdateResult:
    """Result of an oracle update operation."""
    success: bool
    rates_updated: int = 0
    rates_skipped: int = 0
    tx_hash: Optional[str] = None
    block: Optional[int] = None
    gas_used: Optional[int] = None
    error: Optional[str] = None
    details: Optional[Dict] = None


class OracleUpdater:
    """Updates Oracle contract with BCB data on Arbitrum Sepolia."""
    
    def __init__(
        self, 
        rpc_url: Optional[str] = None, 
        contract_address: Optional[str] = None, 
        private_key: Optional[str] = None
    ):
        self.rpc_url = rpc_url or os.getenv("ARBITRUM_SEPOLIA_RPC", "https://sepolia-rollup.arbitrum.io/rpc")
        self.contract_address = contract_address or os.getenv("ORACLE_ADDRESS")
        self.private_key = private_key or os.getenv("PRIVATE_KEY")
        
        if not self.contract_address:
            raise ValueError("ORACLE_ADDRESS not set")
        if not self.private_key:
            raise ValueError("PRIVATE_KEY not set")
        
        self.contract_address = AsyncWeb3.to_checksum_address(self.contract_address)
        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(self.rpc_url))
        self.account = Account.from_key(self.private_key)
        
        # Load ABI from hardhat artifacts
        abi_path = Path(__file__).parent.parent / "contracts/artifacts/contracts/BrazilianMacroOracle.sol/BrazilianMacroOracle.json"
        if not abi_path.exists():
            raise FileNotFoundError(f"ABI not found at {abi_path}. Run 'npx hardhat compile' first.")
        
        with open(abi_path) as f:
            artifact = json.load(f)
            self.contract_abi = artifact["abi"]
        
        self.contract = self.w3.eth.contract(
            address=self.contract_address,
            abi=self.contract_abi
        )
        
        logger.info(f"OracleUpdater initialized")
        logger.info(f"  Updater: {self.account.address}")
        logger.info(f"  Oracle:  {self.contract_address}")
        logger.info(f"  RPC:     {self.rpc_url}")

    async def check_connection(self) -> bool:
        """Verify connection to the blockchain."""
        try:
            chain_id = await self.w3.eth.chain_id
            block = await self.w3.eth.block_number
            logger.info(f"Connected to chain {chain_id}, block {block}")
            return True
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False

    async def get_balance(self) -> float:
        """Get updater account balance in ETH."""
        balance_wei = await self.w3.eth.get_balance(self.account.address)
        return float(self.w3.from_wei(balance_wei, "ether"))

    async def get_current_rate(self, rate_type: str) -> Optional[Dict]:
        """
        Get current rate from oracle contract.
        
        Returns:
            Dict with answer (8 decimals), timestamp, realWorldDate, or None if not found
        """
        try:
            result = await self.contract.functions.getRate(rate_type).call()
            answer = result[0]  # int256
            return {
                "rate_type": rate_type,
                "answer": answer,
                "timestamp": result[1],
                "real_world_date": result[2],
                "value_percent": answer / PRECISION  # Convert to percentage
            }
        except ContractLogicError as e:
            logger.warning(f"Rate {rate_type} not found: {e}")
            return None

    async def get_all_current_rates(self) -> Dict[str, Dict]:
        """Get all current rates from oracle."""
        results = {}
        for rate_type in RateType:
            rate = await self.get_current_rate(rate_type.value)
            if rate:
                results[rate_type.value] = rate
        return results

    async def check_needs_update(self, rate_data: RateData) -> Tuple[bool, str]:
        """
        Check if a rate needs updating based on date.
        
        Returns:
            Tuple of (needs_update: bool, reason: str)
        """
        current = await self.get_current_rate(rate_data.rate_type.value)
        
        if current is None:
            return True, "no_existing_data"
        
        if current["real_world_date"] == rate_data.real_world_date:
            return False, f"same_date:{rate_data.real_world_date}"
        
        if current["real_world_date"] > rate_data.real_world_date:
            return False, f"bcb_data_older:{rate_data.real_world_date}<{current['real_world_date']}"
        
        return True, f"new_date:{current['real_world_date']}->{rate_data.real_world_date}"

    async def sync_rate(self, rate_type: RateType, force: bool = False) -> UpdateResult:
        """
        Fetch from BCB and update a single rate.
        
        Args:
            rate_type: Rate to sync
            force: If True, update even if same date (will revert on-chain)
        """
        async with BCBClient() as bcb:
            rate_data = await bcb.fetch_latest(rate_type)
            
            # Check if update needed
            if not force:
                needs_update, reason = await self.check_needs_update(rate_data)
                if not needs_update:
                    logger.info(f"⏭️  {rate_type.value} skip: {reason}")
                    return UpdateResult(
                        success=True,
                        rates_updated=0,
                        rates_skipped=1,
                        details={"reason": reason}
                    )
            
            return await self._send_single_update(rate_data)

    async def _send_single_update(self, rate_data: RateData) -> UpdateResult:
        """Send a single rate update transaction."""
        try:
            logger.info(f"Updating {rate_data.rate_type.value}: {rate_data.raw_value}% ({rate_data.answer} scaled)")
            
            nonce = await self.w3.eth.get_transaction_count(self.account.address)
            gas_price = await self.w3.eth.gas_price
            chain_id = await self.w3.eth.chain_id
            
            tx_data = self.contract.functions.updateRate(
                rate_data.rate_type.value,
                rate_data.answer,  # Already 8 decimals from BCBClient
                rate_data.real_world_date,
                rate_data.source
            )
            
            gas_estimate = await tx_data.estimate_gas({"from": self.account.address})
            gas_limit = int(gas_estimate * 1.2)
            
            tx = await tx_data.build_transaction({
                "from": self.account.address,
                "nonce": nonce,
                "gas": gas_limit,
                "gasPrice": gas_price,
                "chainId": chain_id
            })
            
            signed_tx = self.w3.eth.account.sign_transaction(tx, self.private_key)
            tx_hash = await self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            
            logger.info(f"TX sent: {tx_hash.hex()}")
            
            receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            success = receipt["status"] == 1
            
            if success:
                logger.info(f"✓ {rate_data.rate_type.value} updated - Block: {receipt['blockNumber']}")
            else:
                logger.error(f"✗ {rate_data.rate_type.value} TX failed")
            
            return UpdateResult(
                success=success,
                rates_updated=1 if success else 0,
                rates_skipped=0,
                tx_hash=tx_hash.hex(),
                block=receipt["blockNumber"],
                gas_used=receipt["gasUsed"],
                error=None if success else "Transaction reverted"
            )
            
        except Exception as e:
            logger.error(f"Update failed for {rate_data.rate_type.value}: {e}")
            return UpdateResult(success=False, error=str(e))

    async def sync_all_rates(self, force: bool = False) -> UpdateResult:
        """
        Fetch all rates from BCB and update oracle using batch function.
        
        The contract's batchUpdateRates skips same-date updates without reverting.
        
        Args:
            force: If True, send all rates (contract still skips same-date)
            
        Returns:
            UpdateResult with counts of updated/skipped rates
        """
        async with BCBClient() as bcb:
            rates = await bcb.fetch_all_latest()
            
            if not rates:
                return UpdateResult(success=False, error="No rates fetched from BCB")
            
            # Pre-check which rates need updating (for logging)
            to_update: List[RateData] = []
            to_skip: List[Tuple[str, str]] = []
            
            for rate_data in rates.values():
                needs_update, reason = await self.check_needs_update(rate_data)
                if needs_update or force:
                    to_update.append(rate_data)
                else:
                    to_skip.append((rate_data.rate_type.value, reason))
            
            # Log what will be skipped
            for rate_type, reason in to_skip:
                logger.info(f"⏭️  {rate_type} skip: {reason}")
            
            if not to_update:
                logger.info("✓ All rates up to date, nothing to sync")
                return UpdateResult(
                    success=True,
                    rates_updated=0,
                    rates_skipped=len(to_skip),
                    details={"skipped": [s[0] for s in to_skip]}
                )
            
            # Prepare batch data (send all, let contract filter)
            rate_types: List[str] = []
            answers: List[int] = []
            dates: List[int] = []
            sources: List[str] = []
            
            for rate_data in rates.values():
                rate_types.append(rate_data.rate_type.value)
                answers.append(rate_data.answer)  # Already 8 decimals
                dates.append(rate_data.real_world_date)
                sources.append(rate_data.source)
            
            logger.info(f"Batch updating {len(to_update)} rates: {[r.rate_type.value for r in to_update]}")
            
            try:
                nonce = await self.w3.eth.get_transaction_count(self.account.address)
                gas_price = await self.w3.eth.gas_price
                chain_id = await self.w3.eth.chain_id
                
                tx_data = self.contract.functions.batchUpdateRates(
                    rate_types, answers, dates, sources
                )
                
                gas_estimate = await tx_data.estimate_gas({"from": self.account.address})
                gas_limit = int(gas_estimate * 1.3)
                
                tx = await tx_data.build_transaction({
                    "from": self.account.address,
                    "nonce": nonce,
                    "gas": gas_limit,
                    "gasPrice": gas_price,
                    "chainId": chain_id
                })
                
                signed_tx = self.w3.eth.account.sign_transaction(tx, self.private_key)
                tx_hash = await self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
                
                logger.info(f"Batch TX sent: {tx_hash.hex()}")
                
                receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
                
                success = receipt["status"] == 1
                
                # Count RateUpdated events to know how many actually updated
                rate_updated_events = [
                    log for log in receipt["logs"] 
                    if len(log["topics"]) > 0
                ]
                actual_updated = len(rate_updated_events)
                
                result = UpdateResult(
                    success=success,
                    rates_updated=len(to_update) if success else 0,
                    rates_skipped=len(to_skip),
                    tx_hash=tx_hash.hex(),
                    block=receipt["blockNumber"],
                    gas_used=receipt["gasUsed"],
                    details={
                        "updated": [r.rate_type.value for r in to_update],
                        "skipped": [s[0] for s in to_skip],
                        "url": f"https://sepolia.arbiscan.io/tx/{tx_hash.hex()}"
                    }
                )
                
                if success:
                    logger.info(f"✓ Batch complete - {len(to_update)} updated, {len(to_skip)} skipped - Block: {receipt['blockNumber']}")
                else:
                    logger.error("✗ Batch TX reverted")
                    result.error = "Transaction reverted"
                
                return result
                
            except Exception as e:
                logger.error(f"Batch update failed: {e}")
                return UpdateResult(success=False, error=str(e))


async def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Oracle Updater CLI")
    parser.add_argument("command", choices=["sync", "sync-all", "status", "balance", "check"], 
                       help="Command to run")
    parser.add_argument("--rate", "-r", type=str, help="Rate type for sync/check command")
    parser.add_argument("--force", "-f", action="store_true", help="Force update even if same date")
    args = parser.parse_args()
    
    updater = OracleUpdater()
    
    if not await updater.check_connection():
        print("Failed to connect to blockchain")
        return
    
    if args.command == "balance":
        balance = await updater.get_balance()
        print(f"Account: {updater.account.address}")
        print(f"Balance: {balance:.6f} ETH")
        
    elif args.command == "status":
        print("\n📊 Current Oracle Rates (8 decimals):")
        print("-" * 70)
        print(f"{'Rate':<6} | {'Answer (scaled)':<18} | {'Percent':>10} | {'Date':>10}")
        print("-" * 70)
        rates = await updater.get_all_current_rates()
        for name, data in rates.items():
            print(f"{name:<6} | {data['answer']:<18} | {data['value_percent']:>9.4f}% | {data['real_world_date']}")
        
    elif args.command == "check":
        print("\n🔍 Checking for updates needed:")
        print("-" * 60)
        async with BCBClient() as bcb:
            rates = await bcb.fetch_all_latest()
            for rate_data in rates.values():
                needs_update, reason = await updater.check_needs_update(rate_data)
                status = "🔄 UPDATE" if needs_update else "✓ CURRENT"
                print(f"{rate_data.rate_type.value:<6}: {status} ({reason})")
        
    elif args.command == "sync":
        if not args.rate:
            print("Error: --rate required for sync command")
            return
        try:
            rate_type = RateType(args.rate.upper())
        except ValueError:
            print(f"Error: Invalid rate type. Choose from: {[r.value for r in RateType]}")
            return
        result = await updater.sync_rate(rate_type, force=args.force)
        print(json.dumps({
            "success": result.success,
            "rates_updated": result.rates_updated,
            "rates_skipped": result.rates_skipped,
            "tx_hash": result.tx_hash,
            "block": result.block,
            "gas_used": result.gas_used,
            "error": result.error,
            "details": result.details
        }, indent=2))
        
    elif args.command == "sync-all":
        result = await updater.sync_all_rates(force=args.force)
        print(json.dumps({
            "success": result.success,
            "rates_updated": result.rates_updated,
            "rates_skipped": result.rates_skipped,
            "tx_hash": result.tx_hash,
            "block": result.block,
            "gas_used": result.gas_used,
            "error": result.error,
            "details": result.details
        }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
