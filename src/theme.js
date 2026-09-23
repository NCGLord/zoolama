// Light/dark: follow the system until the user picks one, then keep their pick.

export function effectiveTheme(saved, systemDark) {
  return saved ?? (systemDark ? 'dark' : 'light');
}

export function toggledTheme(saved, systemDark) {
  return effectiveTheme(saved, systemDark) === 'dark' ? 'light' : 'dark';
}
