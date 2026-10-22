export function adjacentMonth(date, step) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + step, 1)).toISOString().slice(0, 10);
}

export function scheduleValidationError(values) {
  const endDate = values.duration === "single" ? values.startDate : values.endDate;
  if (values.startDate && endDate && endDate < values.startDate) {
    return { field: "endDate", message: "End date must be on or after the start date." };
  }
  if (values.startDate && endDate && values.startTime && values.endTime) {
    const start = new Date(`${values.startDate}T${values.startTime}:00+08:00`).getTime();
    const end = new Date(`${endDate}T${values.endTime}:00+08:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return { field: "endTime", message: "End date and time must be later than the start date and time." };
    }
  }
  if (values.frequency && values.frequency !== "none" && values.startDate && values.repeatUntil && values.repeatUntil < values.startDate) {
    return { field: "repeatUntil", message: "Repeat Until must be on or after the start date." };
  }
  return null;
}

export function requireValidSchedule(values) {
  const error = scheduleValidationError(values);
  if (error) throw new Error(error.message);
}

export function bindScheduleValidation(form) {
  if (!form) return;
  const message = document.createElement("p");
  message.className = "schedule-validation-message";
  message.setAttribute("role", "alert");
  message.hidden = true;
  form.insertBefore(message, form.querySelector("button[type='submit']"));
  const update = (showMessage) => {
    for (const name of ["endDate", "endTime", "repeatUntil"]) form.elements[name]?.setCustomValidity("");
    const error = scheduleValidationError(Object.fromEntries(new FormData(form).entries()));
    if (error) form.elements[error.field]?.setCustomValidity(error.message);
    message.textContent = error?.message || "";
    message.hidden = !showMessage || !error;
    return !error;
  };
  form.addEventListener("input", () => update(true));
  form.addEventListener("change", () => update(true));
  form.addEventListener("invalid", () => update(true), true);
  form.addEventListener("submit", (event) => {
    if (!update(true)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      form.reportValidity();
    }
  }, true);
  update(false);
}
