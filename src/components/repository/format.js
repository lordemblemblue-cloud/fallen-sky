const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function formatNumber(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}