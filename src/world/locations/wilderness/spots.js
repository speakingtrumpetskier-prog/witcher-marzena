// Camera presets for the wilderness set pieces: used by the gallery scene (?scene=wilderness&spot=<id>)
// and by the review shots. cam/look in world meters, hour = time of day, weather as in G.weather.
export const SPOTS = {
  passBlizzard: { loc: 'passStart', cam: [-571, 96.4, 535], look: [-557, 94.6, 520], hour: 14.5, weather: 'blizzard', fov: 50 },
  passClear: { loc: 'passStart', cam: [-570, 96.8, 531], look: [-557.5, 94.6, 520.5], hour: 14.5, weather: 'clear', fov: 50 },
  passFace: { loc: 'passStart', cam: [-551.8, 95.5, 518.2], look: [-556.6, 94.9, 521.4], hour: 14.5, weather: 'clear', fov: 36 },
  bellDusk: { loc: 'bellTower', cam: [92, 2.2, -110], look: [120, 8.5, -150], hour: 17.3, weather: 'clear', fov: 45 },
  belfry: { loc: 'bellTower', cam: [121.3, 6.9, -146.5], look: [118.0, 6.3, -151.0], hour: 17.5, weather: 'clear', fov: 62 },
};
