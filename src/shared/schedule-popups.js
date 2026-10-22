export function bindSchedulePopupColors(root) {
  root.querySelectorAll('.schedule-popup-card[data-popup-kind="calendar"] form select[name="category"]').forEach(select => {
    const update = () => { select.closest('.schedule-popup-card').dataset.popupCategory = select.value; };
    select.addEventListener('change', update);
    update();
  });
}
