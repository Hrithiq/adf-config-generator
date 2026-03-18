#!/usr/bin/env python3
"""
git_push.py
-----------
Automates git add → commit → push for a generated ADF config file.
Pushes to the branch defined in GIT_BRANCH env var (default: adf-configs).

Usage:
    python git_push.py ../configs/MyPipeline.json
    python git_push.py ../configs/MyPipeline.json --message "custom commit message"
"""

import os
import sys
import argparse
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv
from git import Repo, InvalidGitRepositoryError, GitCommandError
from rich.console import Console
from rich.panel import Panel

load_dotenv(Path(__file__).parent.parent / ".env")

console = Console()


def push_config(config_path: Path, message: str = None) -> None:
    """
    Stage, commit, and push the given config file to the target branch.

    Args:
        config_path: Absolute or relative path to the JSON file.
        message: Optional custom commit message.
    """
    config_path = Path(config_path).resolve()
    if not config_path.exists():
        console.print(f"[red]Error:[/red] File not found: {config_path}")
        sys.exit(1)

    # Locate git repo root
    repo_path = os.getenv("GIT_REPO_PATH", str(Path(__file__).parent.parent))
    try:
        repo = Repo(repo_path, search_parent_directories=True)
    except InvalidGitRepositoryError:
        console.print(f"[red]Error:[/red] No git repository found at {repo_path}")
        sys.exit(1)

    target_branch = os.getenv("GIT_BRANCH", "adf-configs")
    remote_name = os.getenv("GIT_REMOTE", "origin")

    # Checkout or create the target branch
    try:
        if target_branch in [b.name for b in repo.branches]:
            repo.git.checkout(target_branch)
            console.print(f"[cyan]→[/cyan] Checked out branch [bold]{target_branch}[/bold]")
        else:
            repo.git.checkout("-b", target_branch)
            console.print(f"[cyan]→[/cyan] Created and checked out branch [bold]{target_branch}[/bold]")
    except GitCommandError as e:
        console.print(f"[red]Error:[/red] Git checkout failed: {e}")
        sys.exit(1)

    # Stage the file
    rel_path = str(config_path.relative_to(Path(repo.working_dir)))
    repo.index.add([rel_path])
    console.print(f"[cyan]→[/cyan] Staged: [dim]{rel_path}[/dim]")

    # Commit
    pipeline_name = config_path.stem
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    commit_message = message or f"feat(adf): add pipeline config '{pipeline_name}' [{timestamp}]"

    if repo.is_dirty(index=True):
        commit = repo.index.commit(commit_message)
        console.print(f"[cyan]→[/cyan] Committed: [dim]{commit.hexsha[:8]}[/dim] {commit_message}")
    else:
        console.print("[yellow]⚠[/yellow] Nothing to commit (file unchanged)")
        return

    # Push
    try:
        origin = repo.remote(name=remote_name)
        push_info = origin.push(refspec=f"{target_branch}:{target_branch}")
        for info in push_info:
            if info.flags & info.ERROR:
                console.print(f"[red]Push error:[/red] {info.summary}")
                sys.exit(1)
        console.print(f"[green]✓[/green] Pushed to [bold]{remote_name}/{target_branch}[/bold]")
    except Exception as e:
        console.print(f"[red]Error:[/red] Push failed: {e}")
        sys.exit(1)

    console.print(Panel.fit(
        f"[bold green]✓ Git push complete[/bold green]\n"
        f"Branch: [cyan]{remote_name}/{target_branch}[/cyan]\n"
        f"File:   [dim]{rel_path}[/dim]\n"
        f"Commit: [dim]{commit_message}[/dim]",
        border_style="green"
    ))


def main():
    parser = argparse.ArgumentParser(description="Push an ADF config file to Git")
    parser.add_argument("filepath", help="Path to the ADF pipeline JSON file")
    parser.add_argument("--message", "-m", help="Custom commit message", default=None)
    args = parser.parse_args()

    push_config(Path(args.filepath), args.message)


if __name__ == "__main__":
    main()
