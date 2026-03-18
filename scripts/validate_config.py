#!/usr/bin/env python3
"""
validate_config.py
------------------
Validates an ADF pipeline JSON file against the ADF Copy Activity schema.

Usage:
    python validate_config.py ../configs/MyPipeline.json
    python validate_config.py ../configs/MyPipeline.json --strict
"""

import json
import sys
import argparse
from pathlib import Path

import jsonschema
from rich.console import Console
from rich.panel import Panel

console = Console()

# Minimal ADF Copy Pipeline JSON Schema
ADF_PIPELINE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ADF Pipeline",
    "type": "object",
    "required": ["name", "properties"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "properties": {
            "type": "object",
            "required": ["activities"],
            "properties": {
                "description": {"type": "string"},
                "activities": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "required": ["name", "type", "typeProperties"],
                        "properties": {
                            "name": {"type": "string"},
                            "type": {"type": "string", "enum": ["Copy", "ExecutePipeline", "ForEach", "IfCondition", "Wait", "WebActivity", "Lookup", "GetMetadata", "Delete", "AzureFunctionActivity", "DatabricksNotebook", "HDInsightHive"]},
                            "dependsOn": {"type": "array"},
                            "policy": {"type": "object"},
                            "userProperties": {"type": "array"},
                            "typeProperties": {
                                "type": "object",
                                "properties": {
                                    "source": {"type": "object"},
                                    "sink": {"type": "object"},
                                    "enableStaging": {"type": "boolean"},
                                    "translator": {"type": "object"}
                                }
                            },
                            "inputs": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "required": ["referenceName", "type"],
                                    "properties": {
                                        "referenceName": {"type": "string"},
                                        "type": {"type": "string", "enum": ["DatasetReference"]}
                                    }
                                }
                            },
                            "outputs": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "required": ["referenceName", "type"],
                                    "properties": {
                                        "referenceName": {"type": "string"},
                                        "type": {"type": "string", "enum": ["DatasetReference"]}
                                    }
                                }
                            }
                        }
                    }
                },
                "annotations": {"type": "array"}
            }
        },
        "triggers": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "type"],
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string", "enum": ["ScheduleTrigger", "TumblingWindowTrigger", "BlobEventsTrigger", "CustomEventsTrigger"]}
                }
            }
        }
    }
}


def validate_adf_schema(config: dict) -> list[str]:
    """
    Validate a config dict against the ADF schema.
    Returns a list of error messages (empty = valid).
    """
    validator = jsonschema.Draft7Validator(ADF_PIPELINE_SCHEMA)
    errors = []
    for error in sorted(validator.iter_errors(config), key=lambda e: e.path):
        path = " → ".join(str(p) for p in error.absolute_path) or "root"
        errors.append(f"{path}: {error.message}")
    return errors


def validate_business_rules(config: dict) -> list[str]:
    """Additional ADF-specific business rule checks."""
    warnings = []
    activities = config.get("properties", {}).get("activities", [])
    for act in activities:
        props = act.get("typeProperties", {})
        if act.get("type") == "Copy":
            if not props.get("source"):
                warnings.append(f"Activity '{act.get('name')}': missing 'source' in typeProperties")
            if not props.get("sink"):
                warnings.append(f"Activity '{act.get('name')}': missing 'sink' in typeProperties")
            if not act.get("inputs"):
                warnings.append(f"Activity '{act.get('name')}': missing 'inputs' dataset references")
            if not act.get("outputs"):
                warnings.append(f"Activity '{act.get('name')}': missing 'outputs' dataset references")
            policy = act.get("policy", {})
            if not policy.get("timeout"):
                warnings.append(f"Activity '{act.get('name')}': no timeout set in policy (recommended)")
    return warnings


def main():
    parser = argparse.ArgumentParser(description="Validate an ADF pipeline JSON file")
    parser.add_argument("filepath", help="Path to the ADF pipeline JSON file")
    parser.add_argument("--strict", action="store_true", help="Fail on warnings too")
    args = parser.parse_args()

    path = Path(args.filepath)
    if not path.exists():
        console.print(f"[red]Error:[/red] File not found: {path}")
        sys.exit(1)

    with open(path) as f:
        try:
            config = json.load(f)
        except json.JSONDecodeError as e:
            console.print(f"[red]Error:[/red] Invalid JSON: {e}")
            sys.exit(1)

    console.print(f"\n[cyan]Validating:[/cyan] {path.name}\n")

    # Schema validation
    schema_errors = validate_adf_schema(config)
    if schema_errors:
        console.print("[red]✗ Schema Validation FAILED[/red]")
        for err in schema_errors:
            console.print(f"  [red]·[/red] {err}")
        sys.exit(1)
    else:
        console.print("[green]✓ Schema validation passed[/green]")

    # Business rules
    warnings = validate_business_rules(config)
    if warnings:
        console.print(f"[yellow]⚠ {len(warnings)} warning(s):[/yellow]")
        for w in warnings:
            console.print(f"  [yellow]·[/yellow] {w}")
        if args.strict:
            sys.exit(1)
    else:
        console.print("[green]✓ Business rules passed[/green]")

    pipeline_name = config.get("name", "Unknown")
    activity_count = len(config.get("properties", {}).get("activities", []))
    trigger_count = len(config.get("triggers", []))

    console.print(Panel.fit(
        f"[bold green]✓ Valid ADF Pipeline[/bold green]\n"
        f"Name: [cyan]{pipeline_name}[/cyan]\n"
        f"Activities: {activity_count}  |  Triggers: {trigger_count}",
        border_style="green"
    ))


if __name__ == "__main__":
    main()
