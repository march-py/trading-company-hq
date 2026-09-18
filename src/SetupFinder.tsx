import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { StatusBadge, type StatusTone } from "./components/StatusBadge";
import { PageScaffold, PanelShell } from "./components/layout";
import { StatePanel } from "./components/states";
import "./setup-finder.css";

type OpportunityStatus = "detected" | "qualified" | "alerted" | "seen";
type Direction = "long" | "short" | "neutral" | null;

type OpportunitySummary = {
  id: string;
  environment: "dev" | "prod";
  source_event_id: string;
  instrument_id: string;
  venue_instrument_id: string | null;
  status: OpportunityStatus;
  strategy_id: string;
  strategy_version: number;
  exchange: string;
  ticker: string;
  interval: string;
  triggered_at: string;
  direction: Direction;
  setup_key: string | null;
  tradingview_deep_link: string;
  detected_at: string;
  qualified_at: string | null;
  alerted_at: string | null;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
};

type OpportunityTransition = {
  id: string;
  opportunity_id: string;
  environment: "dev" | "prod";
  from_status: OpportunityStatus | null;
  to_status: OpportunityStatus;
  transitioned_at: string;
  reason_code: string | null;
};

type OpportunitySourceEvent = {
  id: string;
  event_type: string;
  event_version: number;
  ingested_at: string;
  request_id: string;
  correlation_id: string;
};

type OpportunityDetail = {
  opportunity: OpportunitySummary;
  transitions: OpportunityTransition[];
  source_event: OpportunitySourceEvent;
};

type OpportunityListResponse = {
  items: OpportunitySummary[];
  next_cursor: string | null;
};

const statusOptions: Array<{ value: "" | OpportunityStatus; label: string }> = [
  { value: "", label: "All states" },
  { value: "detected", label: "Detected" },
  { value: "qualified", label: "Qualified" },
  { value: "alerted", label: "Alerted" },
  { value: "seen", label: "Seen" },
];

function statusTone(status: OpportunityStatus): StatusTone {
  if (status === "seen") return "success";
  if (status === "alerted") return "warning";
  if (status === "qualified") return "active";
  return "normal";
}

function formatInstant(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function directionLabel(direction: Direction): string {
  return direction === null ? "—" : direction.toUpperCase();
}

export function SetupFinder({
  initialOpportunityId = null,
}: {
  initialOpportunityId?: string | null;
}) {
  const [items, setItems] = useState<OpportunitySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [statusFilter, setStatusFilter] = useState<"" | OpportunityStatus>("");
  const [tickerInput, setTickerInput] = useState("");
  const [tickerFilter, setTickerFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [workflowState, setWorkflowState] = useState<"idle" | "running" | "error">("idle");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [alertPriority, setAlertPriority] = useState<"low" | "normal" | "high" | "critical">("normal");

  const loadList = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter) params.set("status", statusFilter);
    if (tickerFilter) params.set("ticker", tickerFilter);

    setListState("loading");

    fetch(`/api/opportunities?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Opportunity list failed: ${response.status}`);
        return response.json() as Promise<OpportunityListResponse>;
      })
      .then((payload) => {
        setItems(payload.items);
        setListState("ready");
        setSelectedId((current) => {
          if (
            initialOpportunityId
            && payload.items.some((item) => item.id === initialOpportunityId)
          ) {
            return initialOpportunityId;
          }

          if (
            current
            && payload.items.some((item) => item.id === current)
          ) {
            return current;
          }

          return payload.items[0]?.id ?? null;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListState("error");
      });

    return () => controller.abort();
  }, [statusFilter, tickerFilter, refreshKey, initialOpportunityId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailState("idle");
      return;
    }

    const controller = new AbortController();
    setDetailState("loading");

    fetch(`/api/opportunities/${selectedId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Opportunity detail failed: ${response.status}`);
        return response.json() as Promise<OpportunityDetail>;
      })
      .then((payload) => {
        setDetail(payload);
        setDetailState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetail(null);
        setDetailState("error");
      });

    return () => controller.abort();
  }, [selectedId, detailRefreshKey]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const applyTicker = () => {
    const normalized = tickerInput.trim().toUpperCase();
    setTickerInput(normalized);
    setTickerFilter(normalized);
  };

  const clearFilters = () => {
    setStatusFilter("");
    setTickerInput("");
    setTickerFilter("");
  };

  const runWorkflowAction = async (
    action: "qualify" | "alert" | "seen" | "create-trade-plan",
  ) => {
    if (!selectedId) return;

    setWorkflowState("running");
    setWorkflowMessage("");

    try {
      const response = await fetch(
        `/api/opportunities/${selectedId}/${action}`,
        {
          method: "POST",
          headers: action === "alert"
            ? { "Content-Type": "application/json" }
            : undefined,
          body: action === "alert"
            ? JSON.stringify({ priority: alertPriority })
            : undefined,
        },
      );

      const payload = await response.json() as {
        result?: string;
        error?: string;
        trade_plan_request_id?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "workflow_action_failed");
      }

      if (action === "qualify") {
        setWorkflowMessage("Opportunity qualified by explicit human review.");
      } else if (action === "alert") {
        setWorkflowMessage("Alert routed to Notification Center.");
      } else if (action === "seen") {
        setWorkflowMessage("Opportunity marked seen and notification read.");
      } else {
        setWorkflowMessage(
          payload.trade_plan_request_id
            ? `Trade-plan handoff created: ${shortId(payload.trade_plan_request_id)}. S07 will own entry, stop, targets, sizing, and execution.`
            : "Trade-plan handoff already exists.",
        );
      }

      setWorkflowState("idle");
      setRefreshKey((value) => value + 1);
      setDetailRefreshKey((value) => value + 1);
    } catch {
      setWorkflowState("error");
      setWorkflowMessage("Workflow action failed. No live trade was executed.");
    }
  };

  return (
    <PageScaffold
      eyebrow="TRADING / SETUP FINDER"
      title="Opportunity review"
      description="Review normalized TradingView opportunities with canonical instrument identity, provenance, lifecycle history, and chart context before any trade-planning decision."
      status={<StatusBadge tone={listState === "error" ? "error" : listState === "loading" ? "normal" : "success"} label={listState === "error" ? "DATA UNAVAILABLE" : listState === "loading" ? "LOADING" : `${items.length} OPPORTUNITIES`} />}
      actions={
        <button className="button" type="button" onClick={loadList}>
          <Icon name="refresh" size="sm" />
          Refresh
        </button>
      }
    >
      <PanelShell eyebrow="S05.3 / REVIEW WORKFLOW" title="Setup Finder" detail="HUMAN REVIEW" className="setup-finder-panel">
        <div className="setup-filterbar" aria-label="Opportunity filters">
          <label className="setup-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | OpportunityStatus)}>
              {statusOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="setup-field setup-field--ticker">
            <span>Ticker</span>
            <input
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyTicker();
              }}
              placeholder="BTCUSDT"
              maxLength={128}
            />
          </label>
          <button className="button" type="button" onClick={applyTicker}>Apply</button>
          {(statusFilter || tickerFilter) && <button className="text-button" type="button" onClick={clearFilters}>Clear filters</button>}
        </div>

        {listState === "loading" && (
          <StatePanel kind="loading" title="Loading opportunities" message="Reading the current normalized opportunity queue." />
        )}
        {listState === "error" && (
          <StatePanel kind="error" title="Opportunity data unavailable" message="The private opportunity API could not be read. No data was modified." action={<button className="text-button" type="button" onClick={loadList}>Try again</button>} />
        )}
        {listState === "ready" && items.length === 0 && (
          <StatePanel kind="empty" title="No matching opportunities" message="No opportunities match the current filters. Clear filters or wait for the next TradingView signal." action={<button className="text-button" type="button" onClick={clearFilters}>Clear filters</button>} />
        )}

        {listState === "ready" && items.length > 0 && (
          <div className="setup-workspace">
            <div className="setup-list" role="list" aria-label="Opportunities">
              {items.map((item) => (
                <button
                  type="button"
                  role="listitem"
                  className={`setup-row${selectedId === item.id ? " setup-row--active" : ""}`}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="setup-row__primary">
                    <strong>{item.ticker}</strong>
                    <span>{item.exchange} · {item.interval} · {directionLabel(item.direction)}</span>
                  </span>
                  <span className="setup-row__strategy">{item.strategy_id} <small>v{item.strategy_version}</small></span>
                  <span className="setup-row__time">{formatInstant(item.triggered_at)}</span>
                  <StatusBadge tone={statusTone(item.status)} label={item.status.toUpperCase()} />
                </button>
              ))}
            </div>

            <aside className="setup-detail" aria-label="Opportunity detail">
              {detailState === "loading" && <StatePanel kind="loading" title="Loading detail" message="Reading lifecycle and source-event traceability." />}
              {detailState === "error" && <StatePanel kind="error" title="Detail unavailable" message="This opportunity could not be loaded. The queue remains unchanged." />}
              {detailState === "idle" && <StatePanel kind="empty" title="Select an opportunity" message="Choose an opportunity from the queue to review its evidence." />}
              {detailState === "ready" && detail && selected && (
                <div className="setup-detail__content">
                  <header className="setup-detail__header">
                    <div>
                      <p className="micro-label">OPPORTUNITY</p>
                      <h2>{selected.ticker} <span>{directionLabel(selected.direction)}</span></h2>
                      <p>{selected.exchange} · {selected.interval} · {selected.strategy_id} v{selected.strategy_version}</p>
                    </div>
                    <StatusBadge tone={statusTone(selected.status)} label={selected.status.toUpperCase()} />
                  </header>

                  <div className="setup-facts">
                    <div><span>Triggered</span><strong>{formatInstant(selected.triggered_at)}</strong></div>
                    <div><span>Instrument ID</span><strong title={selected.instrument_id}>{shortId(selected.instrument_id)}</strong></div>
                    <div><span>Venue instrument</span><strong title={selected.venue_instrument_id ?? undefined}>{selected.venue_instrument_id ? shortId(selected.venue_instrument_id) : "Not venue-specific"}</strong></div>
                    <div><span>Setup key</span><strong>{selected.setup_key ?? "—"}</strong></div>
                  </div>

                  <section className="setup-review-block setup-workflow-block">
                    <div className="setup-section-heading">
                      <div><p className="micro-label">S05.3 WORKFLOW</p><h3>Opportunity decision path</h3></div>
                      <span>Manual authority only</span>
                    </div>

                    <p className="setup-workflow-copy">
                      S05.3 advances review state and creates durable notifications or a trade-plan handoff. It does not evaluate S06 strategy rules and cannot size or execute a trade.
                    </p>

                    <div className="setup-workflow-actions">
                      {selected.status === "detected" && (
                        <button
                          className="button"
                          type="button"
                          disabled={workflowState === "running"}
                          onClick={() => void runWorkflowAction("qualify")}
                        >
                          <Icon name="check" size="sm" />
                          Qualify after review
                        </button>
                      )}

                      {selected.status === "qualified" && (
                        <>
                          <label className="setup-field setup-workflow-priority">
                            <span>Alert priority</span>
                            <select
                              value={alertPriority}
                              onChange={(event) => setAlertPriority(event.target.value as "low" | "normal" | "high" | "critical")}
                            >
                              <option value="low">Low</option>
                              <option value="normal">Normal</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </label>
                          <button
                            className="button"
                            type="button"
                            disabled={workflowState === "running"}
                            onClick={() => void runWorkflowAction("alert")}
                          >
                            <Icon name="inbox" size="sm" />
                            Route alert
                          </button>
                        </>
                      )}

                      {selected.status === "alerted" && (
                        <button
                          className="button"
                          type="button"
                          disabled={workflowState === "running"}
                          onClick={() => void runWorkflowAction("seen")}
                        >
                          <Icon name="check" size="sm" />
                          Mark seen
                        </button>
                      )}

                      {selected.status === "seen" && (
                        <button
                          className="button"
                          type="button"
                          disabled={workflowState === "running"}
                          onClick={() => void runWorkflowAction("create-trade-plan")}
                        >
                          <Icon name="chart" size="sm" />
                          Create Trade Plan handoff
                        </button>
                      )}
                    </div>

                    {workflowMessage && (
                      <p className={`setup-workflow-message${workflowState === "error" ? " setup-workflow-message--error" : ""}`}>
                        {workflowMessage}
                      </p>
                    )}
                  </section>

                  <section className="setup-review-block">
                    <div className="setup-section-heading">
                      <div><p className="micro-label">EXPLAINABILITY</p><h3>Review checklist</h3></div>
                      <span>S05.1 baseline</span>
                    </div>
                    <div className="setup-checklist">
                      <div><Icon name="check" size="sm" /><span><strong>Canonical instrument resolved</strong><small>Opportunity carries the required internal instrument identity.</small></span></div>
                      <div><Icon name="check" size="sm" /><span><strong>Source event linked</strong><small>{shortId(detail.source_event.id)} · {detail.source_event.event_type} v{detail.source_event.event_version}</small></span></div>
                      <div><Icon name="check" size="sm" /><span><strong>Strategy version pinned</strong><small>{selected.strategy_id} v{selected.strategy_version}</small></span></div>
                      <div className="setup-checklist__future"><Icon name="circle" size="sm" /><span><strong>Strategy rule checklist</strong><small>Deterministic strategy-rule evaluation is introduced in S06; S05.1 does not invent missing rules.</small></span></div>
                    </div>
                  </section>

                  <section className="setup-review-block">
                    <div className="setup-section-heading"><div><p className="micro-label">LIFECYCLE</p><h3>Traceability</h3></div><span>{detail.transitions.length} transitions</span></div>
                    <div className="setup-timeline">
                      {detail.transitions.map((transition) => (
                        <div className="setup-timeline__item" key={transition.id}>
                          <span className="setup-timeline__dot" />
                          <div><strong>{transition.from_status ? `${transition.from_status} → ` : ""}{transition.to_status}</strong><small>{formatInstant(transition.transitioned_at)}{transition.reason_code ? ` · ${transition.reason_code}` : ""}</small></div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="setup-review-block setup-source-block">
                    <div><span>Source event</span><strong title={detail.source_event.id}>{shortId(detail.source_event.id)}</strong></div>
                    <div><span>Request</span><strong title={detail.source_event.request_id}>{shortId(detail.source_event.request_id)}</strong></div>
                    <div><span>Correlation</span><strong title={detail.source_event.correlation_id}>{shortId(detail.source_event.correlation_id)}</strong></div>
                  </section>

                  <a className="setup-tv-link" href={selected.tradingview_deep_link} target="_blank" rel="noreferrer">
                    <Icon name="chart" size="sm" /> Open source chart in TradingView
                  </a>
                </div>
              )}
            </aside>
          </div>
        )}
      </PanelShell>
    </PageScaffold>
  );
}