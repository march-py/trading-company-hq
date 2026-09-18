import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Icon,
} from "./components/Icon";

import {
  StatusBadge,
  type StatusTone,
} from "./components/StatusBadge";

import {
  PageScaffold,
  PanelShell,
} from "./components/layout";

import {
  StatePanel,
} from "./components/states";

import "./notification-center.css";

type NotificationPriority =
  | "low"
  | "normal"
  | "high"
  | "critical";

type NotificationStatus =
  | "unread"
  | "read";

type NotificationItem = {
  id: string;
  environment:
    | "dev"
    | "prod";
  opportunity_id: string;
  notification_type:
    "opportunity_alert";
  priority:
    NotificationPriority;
  title: string;
  body: string;
  status:
    NotificationStatus;
  read_at:
    string | null;
  created_at: string;
  updated_at: string;
};

type NotificationResponse = {
  items:
    NotificationItem[];
};

function priorityTone(
  priority:
    NotificationPriority,
): StatusTone {
  if (
    priority === "critical"
  ) {
    return "error";
  }

  if (
    priority === "high"
  ) {
    return "warning";
  }

  if (
    priority === "normal"
  ) {
    return "active";
  }

  return "normal";
}

function formatInstant(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl
    .DateTimeFormat(
      undefined,
      {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
    )
    .format(date);
}

function shortId(
  value: string,
): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function NotificationCenter({
  onOpenSetupFinder,
}: {
  onOpenSetupFinder:
    (opportunityId?: string) => void;
}) {
  const [
    items,
    setItems,
  ] = useState<
    NotificationItem[]
  >([]);

  const [
    status,
    setStatus,
  ] = useState<
    "" | NotificationStatus
  >("");

  const [
    state,
    setState,
  ] = useState<
    "loading"
    | "ready"
    | "error"
  >("loading");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    actingId,
    setActingId,
  ] = useState<
    string | null
  >(null);

  const load =
    useCallback(
      () => {
        setRefreshKey(
          (value) =>
            value + 1,
        );
      },
      [],
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      const params =
        new URLSearchParams({
          limit: "50",
        });

      if (status) {
        params.set(
          "status",
          status,
        );
      }

      setState("loading");

      fetch(
        `/api/notifications?${params.toString()}`,
        {
          signal:
            controller.signal,
        },
      )
        .then(
          async (
            response,
          ) => {
            if (
              !response.ok
            ) {
              throw new Error(
                `Notification list failed: ${response.status}`,
              );
            }

            return response
              .json() as Promise<
                NotificationResponse
              >;
          },
        )
        .then(
          (payload) => {
            setItems(
              payload.items,
            );
            setState(
              "ready",
            );
          },
        )
        .catch(
          (
            error: unknown,
          ) => {
            if (
              error
                instanceof DOMException
              && error.name
                === "AbortError"
            ) {
              return;
            }

            setState(
              "error",
            );
          },
        );

      return () =>
        controller.abort();
    },
    [
      status,
      refreshKey,
    ],
  );

  const markRead =
    async (
      notificationId:
        string,
    ) => {
      setActingId(
        notificationId,
      );

      try {
        const response =
          await fetch(
            `/api/notifications/${notificationId}/read`,
            {
              method:
                "POST",
            },
          );

        if (!response.ok) {
          throw new Error(
            "Mark read failed",
          );
        }

        load();
      } catch {
        setState("error");
      } finally {
        setActingId(
          null,
        );
      }
    };

  const unreadCount =
    items.filter(
      (item) =>
        item.status
          === "unread",
    ).length;

  return (
    <PageScaffold
      eyebrow="TRADING / NOTIFICATIONS"
      title="Notification Center"
      description="Review durable Trading Company alerts, priority, read state, and their source opportunity without turning notifications into trade authority."
      status={
        <StatusBadge
          tone={
            state
              === "error"
              ? "error"
              : state
                === "loading"
                ? "normal"
                : unreadCount > 0
                  ? "warning"
                  : "success"
          }
          label={
            state
              === "error"
              ? "DATA UNAVAILABLE"
              : state
                === "loading"
                ? "LOADING"
                : `${unreadCount} UNREAD`
          }
        />
      }
      actions={
        <button
          className="button"
          type="button"
          onClick={load}
        >
          <Icon
            name="refresh"
            size="sm"
          />
          Refresh
        </button>
      }
    >
      <PanelShell
        eyebrow="S05.3 / ALERT ROUTING"
        title="Notifications"
        detail="PRIVATE HQ"
        className="notification-panel"
      >
        <div
          className="notification-filterbar"
        >
          <label
            className="setup-field"
          >
            <span>Status</span>
            <select
              value={status}
              onChange={
                (event) =>
                  setStatus(
                    event
                      .target
                      .value as
                        | ""
                        | NotificationStatus,
                  )
              }
            >
              <option value="">
                All
              </option>
              <option value="unread">
                Unread
              </option>
              <option value="read">
                Read
              </option>
            </select>
          </label>

          <button
            className="text-button"
            type="button"
            onClick={
              onOpenSetupFinder
            }
          >
            Open Setup Finder
          </button>
        </div>

        {state === "loading" && (
          <StatePanel
            kind="loading"
            title="Loading notifications"
            message="Reading the current private alert queue."
          />
        )}

        {state === "error" && (
          <StatePanel
            kind="error"
            title="Notification data unavailable"
            message="The notification workflow could not be read. No trade authority or execution state was changed."
            action={
              <button
                className="text-button"
                type="button"
                onClick={load}
              >
                Try again
              </button>
            }
          />
        )}

        {state === "ready"
          && items.length === 0
          && (
            <StatePanel
              kind="empty"
              title="No notifications"
              message="Qualified opportunities will appear here after an alert is routed."
              action={
                <button
                  className="text-button"
                  type="button"
                  onClick={
                    onOpenSetupFinder
                  }
                >
                  Review opportunities
                </button>
              }
            />
          )}

        {state === "ready"
          && items.length > 0
          && (
            <div
              className="notification-list"
            >
              {items.map(
                (item) => (
                  <article
                    className={
                      `notification-card${item.status === "unread" ? " notification-card--unread" : ""}`
                    }
                    key={
                      item.id
                    }
                  >
                    <div
                      className="notification-card__topline"
                    >
                      <div>
                        <p
                          className="micro-label"
                        >
                          OPPORTUNITY ALERT
                        </p>
                        <h3>
                          {
                            item.title
                          }
                        </h3>
                      </div>

                      <StatusBadge
                        tone={
                          priorityTone(
                            item.priority,
                          )
                        }
                        label={
                          item.priority
                            .toUpperCase()
                        }
                      />
                    </div>

                    <p
                      className="notification-card__body"
                    >
                      {item.body}
                    </p>

                    <div
                      className="notification-card__meta"
                    >
                      <span>
                        {formatInstant(
                          item.created_at,
                        )}
                      </span>
                      <span
                        title={
                          item.opportunity_id
                        }
                      >
                        Opportunity{" "}
                        {shortId(
                          item.opportunity_id,
                        )}
                      </span>
                      <span>
                        {item.status
                          .toUpperCase()}
                      </span>
                    </div>

                    <div
                      className="notification-card__actions"
                    >
                      <button
                        className="text-button"
                        type="button"
                        onClick={
                          () =>
                            onOpenSetupFinder(
                              item.opportunity_id,
                            )
                        }
                      >
                        Review opportunity
                      </button>

                      {item.status
                        === "unread"
                        && (
                          <button
                            className="button"
                            type="button"
                            disabled={
                              actingId
                                === item.id
                            }
                            onClick={
                              () =>
                                void markRead(
                                  item.id,
                                )
                            }
                          >
                            <Icon
                              name="check"
                              size="sm"
                            />
                            {actingId
                              === item.id
                              ? "Marking…"
                              : "Mark seen"}
                          </button>
                        )}
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
      </PanelShell>
    </PageScaffold>
  );
}