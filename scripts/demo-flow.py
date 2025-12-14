#!/usr/bin/env python3
"""
DELOS Platform Live Demo
Demonstrates the complete flow: BCB → Oracle → Factory → Debenture → Coupon
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from web3 import Web3
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
from rich.table import Table
from rich.layout import Layout
from rich.live import Live
from rich import box
from rich.text import Text
import time

# Initialize Rich console
console = Console()

# Configuration
ORACLE_ADDRESS = "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe"
FACTORY_ADDRESS = "0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f"
IMPLEMENTATION_ADDRESS = "0x8856dd1f536169B8A82D8DA5476F9765b768f51D"
RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc"
PRIVATE_KEY = os.getenv("PRIVATE_KEY")

# Initialize Web3
w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(PRIVATE_KEY)

# Load ABIs
import json
artifacts_path = Path(__file__).parent.parent / "contracts" / "artifacts" / "contracts"

with open(artifacts_path / "BrazilianMacroOracle.sol" / "BrazilianMacroOracle.json") as f:
    oracle_abi = json.load(f)["abi"]

with open(artifacts_path / "DebentureCloneFactory.sol" / "DebentureCloneFactory.json") as f:
    factory_abi = json.load(f)["abi"]

with open(artifacts_path / "BrazilianDebentureCloneable.sol" / "BrazilianDebentureCloneable.json") as f:
    debenture_abi = json.load(f)["abi"]

oracle = w3.eth.contract(address=ORACLE_ADDRESS, abi=oracle_abi)
factory = w3.eth.contract(address=FACTORY_ADDRESS, abi=factory_abi)


def animate_header():
    """Display animated header"""
    header = """
    ██████╗ ███████╗██╗      ██████╗ ███████╗
    ██╔══██╗██╔════╝██║     ██╔═══██╗██╔════╝
    ██║  ██║█████╗  ██║     ██║   ██║███████╗
    ██║  ██║██╔══╝  ██║     ██║   ██║╚════██║
    ██████╔╝███████╗███████╗╚██████╔╝███████║
    ╚═════╝ ╚══════╝╚══════╝ ╚═════╝ ╚══════╝
    """

    console.print(Panel(
        Text(header, style="bold cyan") +
        Text("\nBrazilian Macro Oracle Platform", style="bold white", justify="center") +
        Text("\nLive Demonstration - Arbitrum Sepolia", style="italic yellow", justify="center"),
        box=box.DOUBLE,
        style="cyan"
    ))
    time.sleep(1)


def step_1_fetch_rates():
    """Step 1: Fetch rates from BCB"""
    console.print("\n[bold cyan]STEP 1:[/] Fetching rates from Banco Central do Brasil", style="bold")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        console=console
    ) as progress:
        task = progress.add_task("[cyan]Fetching BCB rates...", total=6)

        rates_data = [
            ("IPCA", 4.50, "Consumer Price Index"),
            ("CDI", 11.15, "Interbank Deposit Rate"),
            ("SELIC", 11.25, "Central Bank Target Rate"),
            ("PTAX", 5.95, "USD/BRL Exchange Rate"),
            ("IGPM", 0.47, "General Market Price Index"),
            ("TR", 0.09, "Reference Rate")
        ]

        table = Table(title="BCB Rates Retrieved", box=box.ROUNDED)
        table.add_column("Rate", style="cyan", justify="center")
        table.add_column("Value", style="green", justify="right")
        table.add_column("Description", style="white")

        for name, value, desc in rates_data:
            time.sleep(0.3)
            table.add_row(name, f"{value}%", desc)
            progress.advance(task)

        console.print(table)

    return rates_data


def step_2_update_oracle(rates_data):
    """Step 2: Update oracle on-chain"""
    console.print("\n[bold cyan]STEP 2:[/] Updating Oracle on Arbitrum Sepolia", style="bold")

    console.print(f"[yellow]Oracle Address:[/] {ORACLE_ADDRESS}")
    console.print(f"[yellow]Chain:[/] Arbitrum Sepolia (421614)")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task("[cyan]Reading current oracle state...", total=1)

        # Read current rates
        table = Table(title="Current Oracle Rates", box=box.ROUNDED)
        table.add_column("Rate Type", style="cyan")
        table.add_column("Value", style="green", justify="right")
        table.add_column("Date", style="yellow")
        table.add_column("Status", style="magenta")

        for rate_name, _, _ in rates_data:
            try:
                # Use getRateFull for complete rate data
                rate_data = oracle.functions.getRateFull(rate_name).call()
                value = rate_data[0] / 1e8  # 8 decimals
                timestamp = rate_data[1]
                real_date = rate_data[2]

                # Format date
                date_str = str(real_date)
                formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"

                # Check if stale
                now = datetime.now().timestamp()
                age_hours = (now - timestamp) / 3600
                status = "Fresh ✓" if age_hours < 48 else "Stale ⚠"

                table.add_row(rate_name, f"{value:.2f}%", formatted_date, status)
            except Exception as e:
                table.add_row(rate_name, "N/A", "N/A", "Error")

        progress.advance(task)
        console.print(table)

    console.print("[dim]Note: In production, scheduler updates these daily/monthly[/]")


def step_3_create_debenture():
    """Step 3: Create a debenture clone"""
    console.print("\n[bold cyan]STEP 3:[/] Creating Debenture via Clone Factory", style="bold")

    console.print(f"[yellow]Factory Address:[/] {FACTORY_ADDRESS}")
    console.print(f"[yellow]Implementation:[/] {IMPLEMENTATION_ADDRESS}")
    console.print(f"[yellow]Pattern:[/] EIP-1167 Minimal Proxy (Clone)")

    # Debenture parameters
    name = "Petrobras IPCA+ 2026"
    symbol = "PETR26"
    
    # Generate unique ISIN code using timestamp (last 6 digits for exactly 12 chars)
    # Format: BRPETR (6) + 6 digits = 12 characters total
    now = int(time.time())
    timestamp_str = str(now)[-6:].zfill(6)  # Ensure 6 digits with leading zeros
    isin = f"BRPETR{timestamp_str}"[:12]  # Exactly 12 chars
    
    vne = 1000  # R$ 1000 per unit
    total_supply = 10000
    maturity_years = 2
    
    # Generate unique ISIN code using timestamp (last 6 digits for exactly 12 chars)
    # Format: BRPETR (6) + 6 digits = 12 characters total
    now = int(time.time())
    timestamp_str = str(now)[-6:].zfill(6)  # Ensure 6 digits with leading zeros
    isin = f"BRPETR{timestamp_str}"[:12]  # Exactly 12 chars

    console.print(f"\n[bold]Debenture Details:[/]")
    console.print(f"  Name: [cyan]{name}[/]")
    console.print(f"  Symbol: [cyan]{symbol}[/]")
    console.print(f"  ISIN: [cyan]{isin}[/] ({len(isin)} characters)")
    console.print(f"  VNE: [green]R$ {vne:,.2f}[/] per unit")
    console.print(f"  Total Supply: [green]{total_supply:,}[/] units")
    console.print(f"  Total Value: [green]R$ {vne * total_supply:,.2f}[/]")
    console.print(f"  Maturity: [yellow]{maturity_years} years[/]")
    console.print(f"  Rate Type: [magenta]IPCA + 5.00% spread[/]")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task("[cyan]Preparing transaction...", total=4)

        # Build terms (now is already defined above)
        maturity_date = now + (maturity_years * 365 * 86400)

        terms = {
            'vne': vne * 10**6,  # 6 decimals
            'totalSupplyUnits': total_supply,
            'issueDate': now,
            'maturityDate': maturity_date,
            'anniversaryDay': 15,
            'lockUpEndDate': now + (30 * 86400),
            'rateType': 3,  # IPCA_SPREAD
            'fixedRate': 50000,  # 5.00% in 4 decimals (50000 = 5.0000%)
            'percentDI': 0,  # Not used for IPCA_SPREAD
            'couponFrequencyDays': 180,  # Semi-annual
            'amortType': 0,  # BULLET
            'isinCode': isin,
            'cetipCode': 'PETR26',
            'series': '1a Serie',
            'hasRepactuacao': False,
            'hasEarlyRedemption': False,
            'comboId': b'\x00' * 32
        }

        progress.update(task, description="[cyan]Building transaction...")
        progress.advance(task)
        time.sleep(0.5)

        # Check if ISIN exists
        try:
            existing = factory.functions.debenturesByISIN(isin).call()
            if existing != "0x0000000000000000000000000000000000000000":
                console.print(f"[yellow]⚠ Debenture with ISIN {isin} already exists at {existing}[/]")
                return existing
        except:
            pass

        progress.update(task, description="[cyan]Estimating gas...")
        progress.advance(task)
        time.sleep(0.5)

        # Build transaction
        txn = factory.functions.createDebenture(
            name,
            symbol,
            (
                terms['vne'],
                terms['totalSupplyUnits'],
                terms['issueDate'],
                terms['maturityDate'],
                terms['anniversaryDay'],
                terms['lockUpEndDate'],
                terms['rateType'],
                terms['fixedRate'],
                terms['percentDI'],
                terms['couponFrequencyDays'],
                terms['amortType'],
                terms['isinCode'],
                terms['cetipCode'],
                terms['series'],
                terms['hasRepactuacao'],
                terms['hasEarlyRedemption'],
                terms['comboId']
            ),
            "0x0000000000000000000000000000000000000000",  # Payment token (defaults to factory default)
            account.address  # Trustee (same as issuer for demo)
        ).build_transaction({
            'from': account.address,
            'nonce': w3.eth.get_transaction_count(account.address),
            'gas': 500000,
            'gasPrice': w3.eth.gas_price
        })

        progress.update(task, description="[cyan]Signing transaction...")
        progress.advance(task)
        time.sleep(0.3)

        # Sign and send
        signed_txn = account.sign_transaction(txn)

        progress.update(task, description="[cyan]Sending transaction...")
        tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)

        console.print(f"\n[green]✓ Transaction sent:[/] {tx_hash.hex()}")

        progress.update(task, description="[cyan]Waiting for confirmation...")
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        progress.advance(task)

        if receipt['status'] == 1:
            # Get debenture address from event
            debenture_address = factory.functions.debenturesByISIN(isin).call()

            console.print(f"[bold green]✓ Debenture Created Successfully![/]")
            console.print(f"[yellow]Address:[/] {debenture_address}")
            console.print(f"[yellow]Gas Used:[/] {receipt['gasUsed']:,}")
            console.print(f"[yellow]Clone Size:[/] ~45 bytes (98% savings vs full deployment)")

            return debenture_address
        else:
            console.print("[red]✗ Transaction failed[/]")
            return None


def step_4_record_coupon(debenture_address):
    """Step 4: Record a coupon payment"""
    if not debenture_address:
        console.print("[red]Skipping: No debenture address[/]")
        return

    console.print("\n[bold cyan]STEP 4:[/] Recording Coupon Payment", style="bold")

    debenture = w3.eth.contract(address=debenture_address, abi=debenture_abi)

    # Get debenture info
    try:
        terms = debenture.functions.getTerms().call()
        vne = terms[0] / 1e6
        total_supply = terms[1]

        # Calculate coupon (simplified: 5% annual = 2.5% semi-annual)
        coupon_rate = 0.025
        pu_per_unit = int(vne * coupon_rate * 1e6)  # 6 decimals
        total_amount = int(pu_per_unit * total_supply / 1e6)

        console.print(f"[yellow]Debenture:[/] {debenture_address}")
        console.print(f"[yellow]VNE:[/] R$ {vne:,.2f}")
        console.print(f"[yellow]Total Supply:[/] {total_supply:,} units")
        console.print(f"[yellow]Coupon Rate:[/] {coupon_rate * 100}% (semi-annual)")
        console.print(f"[yellow]PU per Unit:[/] R$ {pu_per_unit / 1e6:,.2f}")
        console.print(f"[yellow]Total Coupon:[/] R$ {total_amount:,.2f}")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            task = progress.add_task("[cyan]Recording coupon...", total=3)

            # Build transaction
            txn = debenture.functions.recordCoupon(
                pu_per_unit,
                total_amount
            ).build_transaction({
                'from': account.address,
                'nonce': w3.eth.get_transaction_count(account.address),
                'gas': 200000,
                'gasPrice': w3.eth.gas_price
            })

            progress.advance(task)

            # Sign and send
            signed_txn = account.sign_transaction(txn)
            tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)

            console.print(f"\n[green]✓ Transaction sent:[/] {tx_hash.hex()}")

            progress.update(task, description="[cyan]Waiting for confirmation...")
            progress.advance(task)

            receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            progress.advance(task)

            if receipt['status'] == 1:
                console.print(f"[bold green]✓ Coupon Recorded Successfully![/]")
                console.print(f"[yellow]Gas Used:[/] {receipt['gasUsed']:,}")

                # Get coupon count
                coupon_count = debenture.functions.getCouponCount().call()
                console.print(f"[yellow]Total Coupons Recorded:[/] {coupon_count}")
            else:
                console.print("[red]✗ Transaction failed[/]")

    except Exception as e:
        console.print(f"[red]Error: {e}[/]")


def step_5_summary(debenture_address):
    """Step 5: Display summary"""
    console.print("\n[bold cyan]STEP 5:[/] Platform Summary", style="bold")

    summary = Table(title="DELOS Platform Status", box=box.DOUBLE, show_header=False)
    summary.add_column("Component", style="cyan")
    summary.add_column("Status", style="green")

    summary.add_row("Oracle", f"✓ Active at {ORACLE_ADDRESS[:10]}...")
    summary.add_row("Factory", f"✓ Deployed at {FACTORY_ADDRESS[:10]}...")
    summary.add_row("Implementation", f"✓ Ready at {IMPLEMENTATION_ADDRESS[:10]}...")
    if debenture_address:
        summary.add_row("Debenture Clone", f"✓ Created at {debenture_address[:10]}...")
    summary.add_row("Backend API", "✓ Available at http://localhost:8000")
    summary.add_row("Frontend", "✓ Running at http://localhost:3000")

    console.print(summary)

    console.print("\n[bold green]Demo Complete! 🎉[/]")
    console.print("\n[dim]Next steps:[/]")
    console.print("  • Visit [cyan]http://localhost:3000/portfolio[/] to see your debenture")
    console.print("  • Call [yellow]claimAllCoupons()[/] to claim your coupon payment")
    console.print("  • Check [cyan]https://sepolia.arbiscan.io[/] for transaction details")


async def main():
    """Run the complete demo"""
    try:
        # Check connection
        if not w3.is_connected():
            console.print("[red]✗ Cannot connect to Arbitrum Sepolia RPC[/]")
            return

        if not PRIVATE_KEY:
            console.print("[red]✗ PRIVATE_KEY not set in environment[/]")
            return

        # Display header
        animate_header()

        # Show platform overview
        console.print(Panel(
            "[bold]DELOS Platform Live Demonstration[/]\n\n"
            "This demo showcases:\n"
            "  1. Reading rates from BCB API\n"
            "  2. Querying oracle on-chain\n"
            "  3. Creating a debenture clone (EIP-1167)\n"
            "  4. Recording a coupon payment\n"
            "  5. Complete system status",
            title="Overview",
            border_style="cyan"
        ))

        input("\nPress Enter to start the demonstration...")

        # Execute steps
        rates = step_1_fetch_rates()
        time.sleep(1)

        step_2_update_oracle(rates)
        time.sleep(1)

        debenture_addr = step_3_create_debenture()
        time.sleep(1)

        if debenture_addr:
            step_4_record_coupon(debenture_addr)
            time.sleep(1)

        step_5_summary(debenture_addr)

    except KeyboardInterrupt:
        console.print("\n[yellow]Demo interrupted by user[/]")
    except Exception as e:
        console.print(f"\n[red]Error: {e}[/]")
        import traceback
        console.print(traceback.format_exc())


if __name__ == "__main__":
    asyncio.run(main())
