// STUB (owner: UI builder). HUD, subtitles, dialogue choices, journal, map, menus, title.
export async function init(G) {
  G.ui = {
    stub: true,
    subtitle: (speaker, text) => console.log(`[sub] ${speaker ? speaker + ': ' : ''}${text}`),
    notify: (t) => console.log(`[notify] ${t}`),
    prompt: () => {},
  };
}
