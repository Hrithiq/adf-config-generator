#!/usr/bin/env python3
"""
generate_config.py
------------------
CLI tool: converts a natural language ADF pipeline request into a validated
JSON config, saves it to ../configs/, and optionally pushes to Git.

Usage:
    python generate_config.py "Move records from SQL 'Billing' to Blob as CSV every Monday"
    python generate_config.py "<request>" --no-push
    python generate_config.py "<request>" --dry-run
"""

import os
import sys
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv

import anthropic
from rich.console import Console
from rich.syntax import Syntax
from rich.panel import Panel
from rich import print as rprint

load_dotenv(Path(__file__).parent.parent / ".env")

console = Console()

SYSTEM_PROMPT = """You are an Azure Data Engineering Expert specializing in Azure Data Factory (ADF) and GitOps.

Task: Convert the user's natural language request into a valid JSON configuration for an ADF Copy Activity Pipeline.

Constraints:
1. Output ONLY raw JSON — no markdown fences, no explanation, no preamble.
2. Use standard ADF JSON schema with: name, properties.description, properties.activities[], and properties.annotations.
3. Each activity must include: name, type ("Copy"), dependsOn, policy, userProperties, typeProperties (source, sink, enableStaging), inputs[], outputs[].
4. If a specific linked service name isn't provided, use smart placeholders: ls_azure_sql_source, ls_blob_storage_sink, ls_adls_sink, ls_cosmos_source, etc.
5. Include a scheduler/trigger block if scheduling is mentioned.
6. Include a translator/mapping section if column names are mentioned.
7. Include dataset references: ds_source_<tablename> and ds_sink_<destination>.
8. Add a top-level "triggers" array if scheduling is mentioned.
9. Set sink format to DelimitedText (CSV) if user says CSV, Parquet if Parquet, JSON if JSON.
10. Always include copyBehavior in sink typeProperties."""


def call_claude(request: str) -> dict:
    """Call Claude API and return parsed JSON config."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        console.print("[red]Error:[/red] ANTHROPIC_API_KEY not set in environment or .env file")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    console.print("[cyan]→[/cyan] Calling Claude API...", end=" ")

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": request}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0]

    console.print("[green]✓[/green]")

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        console.print(f"[red]Error:[/red] Claude returned invalid JSON: {e}")
        console.print("[dim]Raw response:[/dim]")
        console.print(raw)
        sys.exit(1)


def save_config(config: dict, output_dir: Path) -> Path:
    """Save the config JSON to the output directory."""
    output_dir.mkdir(parents=True, exist_ok=True)
    name = config.get("name", "UnnamedPipeline")
    output_path = output_dir / f"{name}.json"
    with open(output_path, "w") as f:
        json.dump(config, f, indent=2)
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Generate ADF pipeline JSON from natural language"
    )
    parser.add_argument("request", help="Natural language description of the pipeline")
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).parent.parent / "configs"),
        help="Directory to save generated JSON (default: ../configs)",
    )
    parser.add_argument(
        "--no-push",
        action="store_true",
        help="Generate and validate but don't push to Git",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print JSON to stdout only, skip file creation",
    )
    args = parser.parse_args()

    console.print(Panel.fit(
        f"[bold cyan]ADF Config Generator[/bold cyan]\n[dim]{args.request}[/dim]",
        border_style="cyan"
    ))

    # Step 1: Generate
    config = call_claude(args.request)

    # Step 2: Validate
    console.print("[cyan]→[/cyan] Validating schema...", end=" ")
    from validate_config import validate_adf_schema
    errors = validate_adf_schema(config)
    if errors:
        console.print("[yellow]⚠ warnings[/yellow]")
        for err in errors:
            console.print(f"  [yellow]·[/yellow] {err}")
    else:
        console.print("[green]✓[/green]")

    # Step 3: Print or save
    if args.dry_run:
        syntax = Syntax(json.dumps(config, indent=2), "json", theme="monokai")
        console.print(syntax)
        return

    output_path = save_config(config, Path(args.output_dir))
    console.print(f"[cyan]→[/cyan] Saved to [bold]{output_path}[/bold]")

    # Step 4: Git push
    if not args.no_push:
        console.print("[cyan]→[/cyan] Pushing to Git...")
        from git_push import push_config
        push_config(output_path)

    console.print(Panel.fit(
        f"[bold green]✓ Done![/bold green]\n"
        f"Pipeline: [cyan]{config.get('name')}[/cyan]\n"
        f"File: [dim]{output_path}[/dim]",
        border_style="green"
    ))


if __name__ == "__main__":
    main()
