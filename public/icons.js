// Clean SF Symbols-style icons (inline SVG, inherit text color)
const s = (body, filled = false) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const icons = {
  play: s('<path d="M7.2 4.3v15.4c0 .9 1 1.5 1.8 1l12.4-7.7c.7-.5.7-1.5 0-2L9 3.3c-.8-.5-1.8.1-1.8 1z"/>', true),
  pause: s('<rect x="5.5" y="3.5" width="4.6" height="17" rx="1.6"/><rect x="13.9" y="3.5" width="4.6" height="17" rx="1.6"/>', true),
  next: s('<path d="M2.5 6.6v10.8c0 .8.9 1.3 1.6.8L11.5 13v4.4c0 .8.9 1.3 1.6.8l8.3-5.4c.6-.4.6-1.2 0-1.6l-8.3-5.4c-.7-.5-1.6 0-1.6.8V11L4.1 5.8c-.7-.5-1.6 0-1.6.8z"/>', true),
  prev: s('<path d="M21.5 6.6v10.8c0 .8-.9 1.3-1.6.8L12.5 13v4.4c0 .8-.9 1.3-1.6.8l-8.3-5.4c-.6-.4-.6-1.2 0-1.6l8.3-5.4c.7-.5 1.6 0 1.6.8V11l7.4-5.2c.7-.5 1.6 0 1.6.8z"/>', true),
  shuffle: s('<path d="M3 7h3c2 0 3.1.9 4.1 2.6l2.8 4.8C13.9 16.1 15 17 17 17h4M3 17h3c1.3 0 2.2-.4 3-1.2M14.8 8.2c.8-.8 1.7-1.2 2.9-1.2H21M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  repeat: s('<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M17 3l3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4M7 21l-3-3 3-3"/>'),
  repeatOne: s('<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M17 3l3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4M7 21l-3-3 3-3"/><path d="M11 10.5l1.3-.8v5" stroke-width="1.8"/>'),
  sliders: s('<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="9.5" cy="17" r="2.5"/>'),
  search: s('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.6 15.6l4.6 4.6"/>'),
  library: s('<path d="M5 4.5v15M9.5 4.5v15M14 5.2l5.2 14.3"/>'),
  note: s('<path d="M9 17.5V6.2l11-2.2v11.3"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15.3" r="2.5"/>'),
  volLow: s('<path d="M4 9.5h2.8L11 5.8v12.4l-4.2-3.7H4z" fill="currentColor" stroke="none"/><path d="M14.5 9.5a3.5 3.5 0 0 1 0 5"/>'),
  volHigh: s('<path d="M3 9.5h2.8L10 5.8v12.4l-4.2-3.7H3z" fill="currentColor" stroke="none"/><path d="M13.5 9.5a3.5 3.5 0 0 1 0 5M16.5 7a7 7 0 0 1 0 10M19.5 4.5a10.5 10.5 0 0 1 0 15"/>'),
  close: s('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  heart: s('<path d="M12 20.3s-7.8-4.6-7.8-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.4-7.8 10.4z"/>', true),
  copy: s('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  download: s('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>'),
  person: s('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>'),
};

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icons[el.dataset.icon] || ''; });
}
