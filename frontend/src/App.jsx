import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are an Azure Data Engineering Expert specializing in Azure Data Factory (ADF) and GitOps.

Task: Convert the user's natural language request into a valid JSON configuration for an ADF Copy Activity Pipeline.

Constraints:
1. Output ONLY raw JSON — no markdown fences, no explanation, no preamble.
2. Use standard ADF JSON schema with: name, properties.description, properties.activities[], properties.parameters (if needed), and properties.annotations.
3. Each activity must include: name, type ("Copy"), dependsOn, policy, userProperties, typeProperties (source, sink, enableStaging), inputs[], outputs[].
4. If a specific linked service name isn't provided, use smart placeholders: ls_azure_sql_source, ls_blob_storage_sink, ls_adls_sink, ls_cosmos_source, etc.
5. Include a scheduler/trigger block if scheduling is mentioned (e.g., "every Monday" → tumbling window or schedule trigger with recurrence).
6. Include a translator/mapping section if column names are mentioned.
7. Include dataset references: ds_source_<tablename> and ds_sink_<destination>.
8. Add a top-level "triggers" array if scheduling is mentioned, with proper recurrence rules.
9. Set sink format to DelimitedText (CSV) if user says CSV, Parquet if Parquet, JSON if JSON.
10. Always include a "copyBehavior": "PreserveHierarchy" or "FlattenHierarchy" in sink based on context.

ADF Schema Reference:
{
  "name": "PipelineName",
  "properties": {
    "description": "...",
    "activities": [{
      "name": "CopyActivityName",
      "type": "Copy",
      "dependsOn": [],
      "policy": { "timeout": "0.12:00:00", "retry": 3, "retryIntervalInSeconds": 30 },
      "userProperties": [],
      "typeProperties": {
        "source": { "type": "AzureSqlSource", "queryTimeout": "02:00:00" },
        "sink": { "type": "DelimitedTextSink", "storeSettings": { "type": "AzureBlobStorageWriteSettings" }, "formatSettings": { "type": "DelimitedTextWriteSettings", "quoteAllText": true, "fileExtension": ".csv" } },
        "enableStaging": false
      },
      "inputs": [{ "referenceName": "ds_source", "type": "DatasetReference" }],
      "outputs": [{ "referenceName": "ds_sink", "type": "DatasetReference" }]
    }],
    "annotations": []
  },
  "triggers": [{
    "name": "TriggerName",
    "type": "ScheduleTrigger",
    "properties": {
      "recurrence": { "frequency": "Week", "interval": 1, "schedule": { "weekDays": ["Monday"] } },
      "pipelines": [{ "pipelineReference": { "referenceName": "PipelineName", "type": "PipelineReference" } }]
    }
  }]
}`;

const EXAMPLES = [
  "Move member records from SQL table 'Billing' to Azure Blob Storage as CSV every Monday",
  "Copy all rows from CosmosDB 'Orders' container to ADLS Gen2 as Parquet daily at 2 AM",
  "Replicate 'CustomerProfile' table from on-premise SQL Server to Azure SQL Database hourly",
  "Export 'Transactions' from Azure SQL to Blob Storage as JSON, mapping columns: txn_id→id, amount→value, timestamp→ts",
];

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 0.9s linear infinite"}}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="7" width="6" height="10" rx="1"/>
      <rect x="9" y="4" width="6" height="16" rx="1" opacity="0.6"/>
      <rect x="16" y="7" width="6" height="10" rx="1"/>
      <line x1="8" y1="12" x2="9" y2="12"/>
      <line x1="15" y1="12" x2="16" y2="12"/>
    </svg>
  );
}

export default function ADFConfigGenerator() {
  const [request, setRequest] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("json");
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef(null);

  useEffect(() => {
    setCharCount(request.length);
  }, [request]);

  const generate = async (userRequest) => {
    const req = userRequest || request;
    if (!req.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveTab("json");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: req }],
        }),
      });
      const data = await response.json();
      const raw = data.content?.map(b => b.text || "").join("").trim();
      const clean = raw.replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResult({ json: JSON.stringify(parsed, null, 2), parsed });
    } catch (err) {
      setError("Failed to generate configuration. Please check your request and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const name = result.parsed?.name || "adf_pipeline";
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const useExample = (ex) => {
    setRequest(ex);
    textareaRef.current?.focus();
  };

  const getSummary = (parsed) => {
    if (!parsed) return null;
    const act = parsed.properties?.activities?.[0];
    const trigger = parsed.triggers?.[0];
    const source = act?.typeProperties?.source?.type || "—";
    const sink = act?.typeProperties?.sink?.type || "—";
    const inputs = act?.inputs?.[0]?.referenceName || "—";
    const outputs = act?.outputs?.[0]?.referenceName || "—";
    const schedule = trigger?.properties?.recurrence
      ? `${trigger.properties.recurrence.frequency} (every ${trigger.properties.recurrence.interval})`
      : "No trigger";
    return { name: parsed.name, source, sink, inputs, outputs, schedule, actName: act?.name };
  };

  const summary = getSummary(result?.parsed);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#0a0c10;
          --surface:#111318;
          --surface2:#181c24;
          --border:#1e2430;
          --border2:#252d3d;
          --accent:#0078d4;
          --accent2:#00b4d8;
          --accent-glow:rgba(0,120,212,0.18);
          --green:#00c48c;
          --red:#ff4d6a;
          --yellow:#f5a623;
          --text:#e8edf5;
          --text2:#8896a8;
          --text3:#4a5568;
          --mono:'IBM Plex Mono',monospace;
          --sans:'DM Sans',sans-serif;
          --display:'Syne',sans-serif;
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scanline{0%{top:-20%}100%{top:110%}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        body{background:var(--bg);color:var(--text);font-family:var(--sans)}
        .app{min-height:100vh;padding:28px 20px;max-width:960px;margin:0 auto}
        .header{display:flex;align-items:flex-start;gap:16px;margin-bottom:36px}
        .header-icon{width:46px;height:46px;background:linear-gradient(135deg,#0052a3,#0078d4);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 20px rgba(0,120,212,0.3)}
        .header-text h1{font-family:var(--display);font-size:22px;font-weight:800;letter-spacing:-0.5px;color:var(--text);line-height:1.2}
        .header-text p{font-size:13px;color:var(--text2);margin-top:4px;font-weight:300;line-height:1.5}
        .badge{display:inline-flex;align-items:center;gap:5px;background:rgba(0,120,212,0.12);border:1px solid rgba(0,120,212,0.25);color:#4da6ff;font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:0.5px;padding:3px 8px;border-radius:4px;margin-top:8px}
        .badge-dot{width:5px;height:5px;background:#4da6ff;border-radius:50%;animation:pulse 2s infinite}
        .input-section{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:20px}
        .input-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--surface2)}
        .input-label{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text2);letter-spacing:1px;text-transform:uppercase}
        .char-count{font-family:var(--mono);font-size:11px;color:var(--text3)}
        textarea{width:100%;background:transparent;border:none;outline:none;resize:none;color:var(--text);font-family:var(--sans);font-size:14px;font-weight:400;line-height:1.7;padding:16px;min-height:100px;placeholder-color:var(--text3)}
        textarea::placeholder{color:var(--text3)}
        .input-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--border)}
        .hint{font-size:12px;color:var(--text3);display:flex;align-items:center;gap:5px}
        .hint kbd{background:var(--surface2);border:1px solid var(--border2);border-radius:3px;padding:1px 5px;font-family:var(--mono);font-size:10px;color:var(--text2)}
        .btn-generate{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#0052a3,#0078d4);color:#fff;border:none;cursor:pointer;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:0.5px;padding:9px 18px;border-radius:8px;transition:all .2s;text-transform:uppercase}
        .btn-generate:hover{background:linear-gradient(135deg,#0060bf,#0090f0);box-shadow:0 0 16px rgba(0,120,212,0.35)}
        .btn-generate:disabled{opacity:0.5;cursor:not-allowed}
        .examples{margin-bottom:24px}
        .examples-label{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
        .examples-list{display:flex;flex-direction:column;gap:6px}
        .example-btn{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 13px;text-align:left;cursor:pointer;font-size:12px;color:var(--text2);font-family:var(--sans);transition:all .15s;display:flex;align-items:flex-start;gap:8px;line-height:1.5}
        .example-btn:hover{border-color:var(--border2);background:var(--surface2);color:var(--text)}
        .example-bullet{color:var(--accent);flex-shrink:0;font-family:var(--mono);font-size:12px;margin-top:1px}
        .result{animation:fadeIn .35s ease;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden}
        .result-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--surface2)}
        .tabs{display:flex;gap:2px;background:var(--bg);border-radius:6px;padding:3px}
        .tab{padding:5px 12px;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;border-radius:4px;cursor:pointer;color:var(--text3);border:none;background:transparent;transition:all .15s}
        .tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,0.4)}
        .result-actions{display:flex;gap:8px}
        .action-btn{display:flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--border2);color:var(--text2);cursor:pointer;font-family:var(--mono);font-size:11px;padding:5px 11px;border-radius:6px;transition:all .15s}
        .action-btn:hover{border-color:var(--accent);color:var(--accent)}
        .action-btn.success{border-color:var(--green);color:var(--green)}
        .json-block{padding:16px;overflow-x:auto;max-height:420px;overflow-y:auto}
        .json-block pre{font-family:var(--mono);font-size:12.5px;line-height:1.8;color:#c9d8ec;white-space:pre-wrap;word-break:break-word}
        .summary{padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .summary-card{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px}
        .summary-card-label{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
        .summary-card-value{font-family:var(--mono);font-size:13px;color:var(--accent2);font-weight:500;word-break:break-word}
        .summary-card.full{grid-column:1/-1}
        .pipeline-name{font-family:var(--display);font-size:15px;font-weight:700;color:var(--text)}
        .error{background:rgba(255,77,106,0.08);border:1px solid rgba(255,77,106,0.2);border-radius:10px;padding:14px 16px;color:#ff7a8a;font-family:var(--mono);font-size:12px;margin-top:16px;animation:fadeIn .3s ease}
        .loading-state{display:flex;align-items:center;justify-content:center;gap:12px;padding:48px;color:var(--text2);font-family:var(--mono);font-size:13px}
        .scrollbar::-webkit-scrollbar{width:6px;height:6px}
        .scrollbar::-webkit-scrollbar-track{background:transparent}
        .scrollbar::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
        .divider{height:1px;background:var(--border);margin:6px 0}
        .flow-indicator{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px;color:var(--text2)}
        .flow-node{background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:4px 9px;color:var(--text)}
        .flow-arrow{color:var(--accent);font-size:14px}
        .flow-badge{background:rgba(0,196,140,0.1);border:1px solid rgba(0,196,140,0.2);color:var(--green);border-radius:4px;padding:3px 8px;font-size:10px;margin-left:auto}
      `}</style>

      <div className="app">
        <div className="header">
          <div className="header-icon">
            <PipelineIcon />
          </div>
          <div className="header-text">
            <h1>ADF Config Generator</h1>
            <p>Describe your data pipeline in plain English — get production-ready Azure Data Factory JSON instantly.</p>
            <span className="badge"><span className="badge-dot" />AI-Powered · ADF v2 Schema · GitOps Ready</span>
          </div>
        </div>

        <div className="input-section">
          <div className="input-header">
            <span className="input-label">Pipeline Request</span>
            <span className="char-count">{charCount} chars</span>
          </div>
          <textarea
            ref={textareaRef}
            className="scrollbar"
            value={request}
            onChange={e => setRequest(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
            placeholder="e.g. Move member records from the SQL table 'Billing' to Azure Blob Storage as CSV every Monday..."
            rows={4}
          />
          <div className="input-footer">
            <span className="hint">
              Press <kbd>⌘ Enter</kbd> to generate
            </span>
            <button
              className="btn-generate"
              onClick={() => generate()}
              disabled={loading || !request.trim()}
            >
              {loading ? <SpinnerIcon /> : <BoltIcon />}
              {loading ? "Generating..." : "Generate Config"}
            </button>
          </div>
        </div>

        <div className="examples">
          <div className="examples-label">Quick examples</div>
          <div className="examples-list">
            {EXAMPLES.map((ex, i) => (
              <button key={i} className="example-btn" onClick={() => useExample(ex)}>
                <span className="example-bullet">›</span>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="error">⚠ {error}</div>}

        {loading && (
          <div className="result">
            <div className="loading-state">
              <SpinnerIcon />
              Synthesizing ADF pipeline configuration…
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="result">
            <div className="result-header">
              <div className="tabs">
                <button className={`tab ${activeTab === "json" ? "active" : ""}`} onClick={() => setActiveTab("json")}>JSON</button>
                <button className={`tab ${activeTab === "summary" ? "active" : ""}`} onClick={() => setActiveTab("summary")}>Summary</button>
              </div>
              <div className="result-actions">
                <button className={`action-btn ${copied ? "success" : ""}`} onClick={handleCopy}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button className="action-btn" onClick={handleDownload}>
                  <DownloadIcon />
                  Download .json
                </button>
              </div>
            </div>

            {summary && (
              <div className="flow-indicator">
                <span className="flow-node">{summary.inputs}</span>
                <span className="flow-arrow">→</span>
                <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text3)"}}>Copy Activity</span>
                <span className="flow-arrow">→</span>
                <span className="flow-node">{summary.outputs}</span>
                <span className="flow-badge">✓ Valid JSON</span>
              </div>
            )}

            {activeTab === "json" && (
              <div className="json-block scrollbar">
                <pre>{result.json}</pre>
              </div>
            )}

            {activeTab === "summary" && summary && (
              <div className="summary">
                <div className="summary-card full">
                  <div className="summary-card-label">Pipeline Name</div>
                  <div className="pipeline-name">{summary.name}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-card-label">Activity</div>
                  <div className="summary-card-value">{summary.actName}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-card-label">Schedule</div>
                  <div className="summary-card-value">{summary.schedule}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-card-label">Source Type</div>
                  <div className="summary-card-value">{summary.source}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-card-label">Sink Type</div>
                  <div className="summary-card-value">{summary.sink}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-card-label">Source Dataset</div>
                  <div className="summary-card-value">{summary.inputs}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-card-label">Sink Dataset</div>
                  <div className="summary-card-value">{summary.outputs}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
