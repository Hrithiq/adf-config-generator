# 🔷 ADF Config Generator

> **Natural language → production-ready Azure Data Factory JSON pipelines, automatically committed to Git and deployed to Azure.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/Python-3.9%2B-blue)](https://python.org)
[![React 18](https://img.shields.io/badge/React-18-61dafb)](https://reactjs.org)
[![Azure Data Factory](https://img.shields.io/badge/Azure-Data%20Factory-0078d4)](https://azure.microsoft.com/en-us/products/data-factory)

---

## 📌 What This Does

Describe your data pipeline in plain English. Get a validated, production-ready Azure Data Factory (ADF) `Copy Activity` JSON config — automatically committed to GitHub and deployed to your Data Factory instance via CI/CD.

```
"Move member records from SQL table 'Billing' to Azure Blob Storage as CSV every Monday"
                              ↓  Claude AI
{ "name": "CopyBillingToBlob_Weekly", "properties": { "activities": [...], "triggers": [...] } }
                              ↓  Python + GitPython
             Git commit → GitHub push → GitHub Actions → ADF deployed ✅
```

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────┐
│                 React Frontend (Vite)               │
│  User types request → Calls Claude API → Shows JSON │
└────────────────────┬───────────────────────────────┘
                     │ Download .json
                     ↓
┌────────────────────────────────────────────────────┐
│              Python Automation Scripts              │
│  1. generate_config.py  → Calls Claude API (CLI)   │
│  2. validate_config.py  → jsonschema validation     │
│  3. git_push.py         → git add / commit / push   │
└────────────────────┬───────────────────────────────┘
                     │ Push to branch: adf-configs
                     ↓
┌────────────────────────────────────────────────────┐
│           GitHub Actions (.github/workflows)        │
│  Triggers on push to adf-configs branch             │
│  Runs: az datafactory pipeline create-or-update    │
└────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
adf-config-generator/
│
├── README.md
├── .gitignore
├── LICENSE
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── App.jsx
│
├── scripts/
│   ├── requirements.txt
│   ├── generate_config.py
│   ├── validate_config.py
│   └── git_push.py
│
├── schemas/
│   └── adf_pipeline_schema.json
│
├── configs/
│   └── .gitkeep
│
└── .github/
    └── workflows/
        └── deploy-adf.yml
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Frontend |
| Python | 3.9+ | Scripts |
| Azure CLI | latest | Deployment |
| Git | any | Version control |

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/adf-config-generator.git
cd adf-config-generator

# Frontend
cd frontend && npm install

# Python scripts
cd ../scripts && pip install -r requirements.txt
```

### 2. Configure Secrets

Create a `.env` file in the project root (never commit this):

```env
ANTHROPIC_API_KEY=sk-ant-...
AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_RESOURCE_GROUP=rg-data-engineering
AZURE_DATA_FACTORY_NAME=adf-your-factory-name
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=your-service-principal-secret
GIT_REPO_PATH=/path/to/this/repo
GIT_BRANCH=adf-configs
```

Add the same variables as GitHub Secrets (Settings → Secrets → Actions) for CI/CD.

### 3. Run the Frontend

```bash
cd frontend
npm run dev
# → http://localhost:5173
```

### 4. Run Python CLI

```bash
cd scripts
python generate_config.py "Copy all rows from CosmosDB 'Orders' to ADLS Gen2 as Parquet daily at 2 AM"
```

This will: call Claude → validate JSON → save to `configs/` → git commit & push → trigger deploy.

---

## 🎨 Frontend Features

- Natural language input with keyboard shortcut (`⌘ Enter`)
- Quick-start example prompts
- JSON view (syntax-highlighted) + Summary view (source, sink, schedule at a glance)
- Copy to clipboard & Download `.json`

### Supported Pipeline Patterns

| Request Pattern | Generated Config |
|----------------|-----------------|
| `to Blob Storage as CSV every Monday` | `DelimitedTextSink` + Weekly `ScheduleTrigger` |
| `as Parquet daily at 2 AM` | `ParquetSink` + Daily `ScheduleTrigger` |
| `mapping columns: txn_id→id` | `translator` block with column mappings |
| `from on-premise SQL Server` | `SqlServerSource` + IR placeholder |
| `hourly` | `ScheduleTrigger` with hourly recurrence |

---

## 🐍 Python Scripts

```bash
# Generate + validate + push
python generate_config.py "<request>"

# Validate only
python validate_config.py ../configs/MyPipeline.json

# Push existing file to git
python git_push.py ../configs/MyPipeline.json
```

---

## ⚙️ CI/CD (GitHub Actions)

On every push to `adf-configs` branch that touches `configs/*.json`:

1. Detects changed pipeline JSON files
2. Logs into Azure with service principal
3. Runs `az datafactory pipeline create-or-update` for each file
4. Reports deployment status as a commit comment

---

## 🔒 Security Notes

- Never commit `.env` or API keys
- In production, proxy the `ANTHROPIC_API_KEY` server-side
- Prefer Azure Managed Identity over service principal secrets
- `configs/` contains only pipeline definitions — no credentials

---

## 🤝 Contributing

1. Fork → feature branch → PR
2. Follow [Conventional Commits](https://www.conventionalcommits.org/)

---

## 📄 License

MIT License — see [LICENSE](LICENSE)
