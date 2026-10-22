import { createCollectionRefresh } from "./collection-refresh.js";

export function createBookingRefresh({ bookings, ...options }) {
  return createCollectionRefresh({ ...options, items: bookings, errorMessage: "Reservations could not be refreshed. Please try again." });
}
