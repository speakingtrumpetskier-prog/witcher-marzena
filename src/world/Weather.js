// STUB (owner: atmosphere builder). Weather state machine, snowfall, wind.
export async function init(G) {
  G.weather = { state: G.params.get('weather') || 'clear', set(state) { this.state = state; }, stub: true };
}
