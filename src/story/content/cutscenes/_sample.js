// SAMPLE cutscene: proves the director (crane establishing shot, a tracked walk, two lines in
// shot / reverse shot, a close-up, a title card, a fade). Not part of the story.
// Run: ?scene=story&play=cutscene   or   await G.cutscenes.play('_sample')
const HANKA = [62, 62];
const START = [47, 77];
const STOP = [61.1, 63.2];

export default async function sample(d) {
  d.setup({ time: 16.3, weather: 'clear', music: 'village', letterbox: true });
  const vesna = d.player();
  const hanka = d.actor('hanka', { preset: 'hanka', at: HANKA, yaw: Math.PI * 0.85 });
  d.place(vesna, START[0], START[1], 2.4);
  d.anim(hanka, 'cross_arms');
  d.lookAt(hanka, vesna);

  // 1. Establishing crane: low by the ice, rising up and back over the shore.
  d.fade(0, 1.6);
  await d.shot({
    from: { x: 66, z: 55.5, h: 0.5 },
    via: [{ x: 70, z: 62, h: 3.2 }],
    to: { x: 74, z: 74, h: 9 },
    look: d.head(hanka), lookTo: d.ground(57, 68, 1.2),
    fov: 42, fovTo: 48, dur: 6.5, ease: 'inOut',
  });

  // 2. The walk, tracked from her right side.
  const walking = d.walk(vesna, STOP[0], STOP[1]);
  await d.follow(vesna, [1.5, 1.45, 1.6], d.head(vesna), 4.2, { lag: 2.5, fov: 40, frame: [0.12, 0.2] });
  await walking;
  // Hanka turns from the ice to face her.
  d.face(vesna, hanka);
  d.face(hanka, vesna);
  d.lookAt(vesna, hanka);
  await d.wait(0.8);

  // 3. Two lines, shot and reverse shot.
  d.cut(d.ots(hanka, vesna));
  await d.say(hanka, 'You came, then.');
  d.cut(d.ots(vesna, hanka));
  await d.say(vesna, 'Your note said all you have.');

  // 4. Close-up, pushing in.
  const cu = d.close(hanka, vesna);
  const push = d.shot({ pos: cu.pos, to: cu.pos.clone().lerp(cu.look, 0.12), look: cu.look, fov: cu.fov, frame: cu.frame, dur: 4, ease: 'sine', shake: 0.15 });
  await d.say(hanka, 'It is all I have.', 3.2);
  await push;

  // 5. Title card over the lake.
  d.cut({ pos: d.ground(58, 72, 3.2), look: d.ground(120, -150, 14), fov: 38 });
  d.shot({ to: d.ground(58, 70, 3.6), dur: 6, ease: 'sine' });
  await d.titleCard('Something Walks the Ice', 'Marzena', 5);

  // 6. Out.
  await d.fade(1, 1.5);
  d.flag('_sample_cutscene_done');
  d.end({ player: { x: STOP[0], z: STOP[1], yaw: Math.PI * 0.8 } });
}
