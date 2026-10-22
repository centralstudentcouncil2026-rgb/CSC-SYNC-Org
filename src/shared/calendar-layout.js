// Single-day and spanning occurrences share the same lanes in each week.
export function monthSegments(events, year, month, startOffset, dateOf = (value) => value.slice(0, 10)) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const first = `${prefix}01`;
  const last = `${prefix}${lastDay}`;
  const unique = new Map();
  for (const event of events) {
    const startsAt = event.occurrenceFullStartsAt || event.startsAt;
    const endsAt = event.occurrenceFullEndsAt || event.endsAt;
    unique.set(`${event.id}:${startsAt}:${endsAt}`, { ...event, startsAt, endsAt });
  }
  const segments = [];
  for (const event of unique.values()) {
    const start = dateOf(event.startsAt) < first ? first : dateOf(event.startsAt);
    const end = dateOf(event.endsAt) > last ? last : dateOf(event.endsAt);
    if (start > end) continue;
    let index = startOffset + Number(start.slice(8, 10)) - 1;
    const endIndex = startOffset + Number(end.slice(8, 10)) - 1;
    while (index <= endIndex) {
      const row = Math.floor(index / 7);
      const segmentEnd = Math.min(endIndex, row * 7 + 6);
      segments.push({ event, row, start: index % 7, end: segmentEnd % 7 });
      index = segmentEnd + 1;
    }
  }
  segments.sort((a, b) => a.row - b.row || a.start - b.start || b.end - a.end || a.event.startsAt.localeCompare(b.event.startsAt) || String(a.event.id).localeCompare(String(b.event.id)));
  const rows = new Map();
  for (const segment of segments) {
    if (!rows.has(segment.row)) rows.set(segment.row, []);
    const lanes = rows.get(segment.row);
    let lane = lanes.findIndex((end) => end < segment.start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = segment.end;
    segment.lane = lane;
  }
  return segments;
}

export function renderMonthRows(segments, rowCount, renderBar) {
  return Array.from({ length: rowCount }, (_, row) => `<div class="month-schedule-row" style="top:${row * 100 / rowCount}%;height:${100 / rowCount}%">${segments.filter((segment) => segment.row === row).map(({ event, start, end, lane }) => `<div class="month-schedule-slot" data-lane="${lane}" data-start="${start}" data-end="${end}" style="--bar-lane:${lane}">${renderBar(event, 1, start + 1, end + 2, lane, 1)}</div>`).join("")}${Array.from({ length: 7 }, (_, column) => `<span class="month-more" data-more-column="${column}" style="left:${column * 100 / 7}%;width:${100 / 7}%" hidden></span>`).join("")}</div>`).join("");
}

let monthResizeObserver;
export function bindMonthOverflow(scope = document) {
  monthResizeObserver?.disconnect();
  const rows = [...scope.querySelectorAll(".month-schedule-row")];
  const update = () => rows.forEach((row) => {
    const capacity = 3;
    // Fit the strips inside the existing week height without enlarging the month.
    const height = row.getBoundingClientRect().height;
    const footer = Math.min(18, height * 0.15);
    const top = Math.min(32, height * 0.65);
    const step = Math.max(0, Math.min(24, (height - top - footer - 4) / capacity));
    const stripHeight = step * 5 / 6;
    row.style.setProperty("--schedule-top", `${top}px`);
    row.style.setProperty("--schedule-step", `${step}px`);
    row.style.setProperty("--schedule-height", `${stripHeight}px`);
    row.style.setProperty("--schedule-font", `${Math.min(12, stripHeight * 0.8)}px`);
    row.style.setProperty("--more-height", `${footer}px`);
    const hiddenCounts = Array(7).fill(0);
    row.querySelectorAll(".month-schedule-slot").forEach((slot) => {
      slot.hidden = Number(slot.dataset.lane) >= capacity;
      if (slot.hidden) for (let col = Number(slot.dataset.start); col <= Number(slot.dataset.end); col++) hiddenCounts[col]++;
    });
    row.querySelectorAll("[data-more-column]").forEach((label) => {
      const count = hiddenCounts[Number(label.dataset.moreColumn)];
      label.hidden = !count;
      label.textContent = `+${count} more`;
    });
  });
  update();
  monthResizeObserver = new ResizeObserver(update);
  rows.forEach((row) => monthResizeObserver.observe(row));
}
