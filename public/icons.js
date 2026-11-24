const paths = {
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  collapse: '<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>',
  moon: '<path d="M20.5 14.1A8.7 8.7 0 0 1 9.9 3.5a8.8 8.8 0 1 0 10.6 10.6Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  book: '<path d="M3 4q5-2 9 1 5-3 9-1v15q-4-2-9 1-5-3-9-1zM12 5v15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  local:
    '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2zM16 5a3 3 0 0 1 0 6m2 3q4 1 4 6h-4"/>',
  bot: '<rect x="3" y="7" width="18" height="14" rx="4"/><path d="M12 7V3m-6 9v2m12-2v2m-8 3h4M1 12v4m22-4v4"/><circle cx="12" cy="2" r="1"/>',
  online:
    '<circle cx="12" cy="12" r="9.5"/><ellipse cx="12" cy="12" rx="4.5" ry="9.5"/><path d="M3 9h18M3 15h18"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  flag: '<path d="M5 22V3c6-5 8 5 15 0v11c-6 5-10-5-15 0"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  route:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h8"/>',
};
export const icon = (name, size = 20) =>
  '<svg aria-hidden="true" width="' +
  size +
  '" height="' +
  size +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  paths[name] +
  "</svg>";
