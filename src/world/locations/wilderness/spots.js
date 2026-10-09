// Camera presets for the wilderness set pieces: used by the gallery scene (?scene=wilderness&spot=<id>)
// and by the review shots. cam/look in world meters, hour = time of day, weather as in G.weather,
// aurora = G.sky.auroraOverride (0..1). `loc` names the wilderness id the gallery builds for the preset.
// The same numbers work in the full world:
//   node scripts/shot.mjs --q "loc=wilderness&only=atmosphere,sky,terrain,water,rocks,weather,vegetation,locations,postfx&cam=x,y,z&look=x,y,z&fov=50&hour=14.5&weather=blizzard" --out shots/wilderness/x.png
export const SPOTS = {
  passBlizzard: { loc: 'passStart', cam: [-554.17, 95.76, 515.18], look: [-567.13, 91.8, 529.89], hour: 14.5, weather: 'blizzard', fov: 50 },
  passClear: { loc: 'passStart', cam: [-554.21, 96.16, 512.62], look: [-563.58, 92.7, 529.95], hour: 14.5, weather: 'clear', fov: 52 },
  passFace: { loc: 'passStart', cam: [-551.8, 95.5, 518.2], look: [-556.6, 94.9, 521.4], hour: 14.5, weather: 'clear', fov: 36 },
  bellDusk: { loc: 'bellTower', cam: [85, 2.6, -105], look: [120, 8.5, -150], hour: 16.3, weather: 'clear', fov: 45 },
  belfry: { loc: 'bellTower', cam: [121.3, 6.9, -146.5], look: [118.0, 6.3, -151.0], hour: 17.4, weather: 'clear', fov: 62 },
  islandNight: { loc: 'island', cam: [-113, 9.01, -177], look: [-116.91, 10.7, -196.54], hour: 22, weather: 'clear', fov: 60, aurora: 1 },
  smuggler: { loc: 'marsh', cam: [-276.8, 1.5, -53.9], look: [-289.91, -1.78, -68.65], hour: 22, weather: 'clear', fov: 52, aurora: 1 },
  marshWisps: { loc: 'marsh', cam: [-226, 1.5, -80], look: [-245.84, 1.26, -77.47], hour: 22, weather: 'clear', fov: 58, aurora: 1 },
  hotSpring: { loc: 'hotSpring', cam: [-82, 16.34, -316], look: [-80.27, 14.61, -335.85], hour: 15.5, weather: 'clear', fov: 58 },
  bearFar: { loc: 'bearDen', cam: [154, 21.24, -329.7], look: [151.79, 20.96, -349.58], hour: 15, weather: 'clear', fov: 55 },
  bearMouth: { loc: 'bearDen', cam: [153, 18.74, -348.7], look: [148.42, 19.57, -368.15], hour: 15, weather: 'clear', fov: 58 },
};
