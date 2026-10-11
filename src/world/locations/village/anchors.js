// Story anchors: world-space positions (THREE.Vector3) the story controller, quests and cutscenes
// look up at G.world.locations.village. Positions only move with the village plan, never by hand.
import * as THREE from 'three';

export function buildAnchors(V) {
  const { G } = V;
  const L = G.world.locations.village;
  const st = G.world.stations;
  const rec = (id) => V.byId[id];
  const A = (id, key) => rec(id)?.p.anchors[key]?.clone();
  const at = (x, z, dy = 0) => new THREE.Vector3(x, G.world.heightAt(x, z) + dy, z);
  const doorPos = (id, i = 0) => { const d = rec(id).p.doors[i] || rec(id).p.doors[0]; return new THREE.Vector3(d.x, d.y + 0.05, d.z); };
  const stationPos = (id) => { const s = st[id]; return s ? new THREE.Vector3(s.x, s.y ?? G.world.heightAt(s.x, s.z), s.z) : null; };

  const well = rec('well'), board = rec('noticeBoard');
  const milk = A('hanka', 'milk');
  const gravePos = (id) => { const g = rec(id); return g ? new THREE.Vector3(...[g.p.anchors.grave.x, g.p.anchors.grave.y, g.p.anchors.grave.z]) : null; };

  Object.assign(L, {
    // square
    noticeBoard: A('noticeBoard', 'contract') || at(board.x, board.z, 1.5),
    noticeBoardStand: at(...board.p.localToWorld(0, 0, 1.6).toArray().filter((_, i) => i !== 1)),
    wellPos: at(well.x, well.z),
    squareCenter: at(0, 118),
    // tavern
    tavernDoor: doorPos('tavern'),
    tavernBed: stationPos('tavern_bed'),
    tavernBar: A('tavern', 'bar'),
    tavernKeeper: A('tavern', 'keeper'),
    // longhouse and the cellar
    longhouseDoor: doorPos('longhouse'),
    cellarHatch: A('longhouse', 'cellarDoor'),
    ledger: A('longhouse', 'ledger'),
    reeveTable: stationPos('reeve_table'),
    // Hanka
    hankaDoor: doorPos('hanka'),
    hankaTable: A('hanka', 'table'),
    milkBowl: milk,
    // Dobra and the song
    workshopYard: new THREE.Vector3(V.yard.x, G.world.heightAt(V.yard.x, V.yard.z), V.yard.z),
    workshopDoor: A('workshop', 'door'),
    dobraDoorway: stationPos('dobra_doorway'),
    // shrine, shore, hill
    shrineFire: A('shrine', 'fire'),
    shrineAltar: A('shrine', 'altar'),
    kidsFort: at(V.fort.x, V.fort.z, 0.3),
    drawing: V.fort.drawing.position.clone(),
    graveWiesia: gravePos('grave_wiesia'),
    graveMateusz: gravePos('grave_mateusz'),
    graveyard: at(94, 166),
    gate: A('gate_west', 'door'),
    gateSouth: A('gate_south', 'door'),
    stable: stationPos('stable_kasza'),
    sledHill: at(-40, 208),
    smithy: A('smithy', 'forge'),
    anvil: A('smithy', 'anvil'),
    banya: doorPos('banya'),
    boathouse: doorPos('boathouse'),
    boardwalk: V.shore.path.map(([x, z]) => at(x, z, V.shore.bwY ? V.shore.bwY(x) - G.world.heightAt(x, z) : 0.45)),
    huts: V.shore.huts.map((h) => doorPos(h.id)),
    // handy lookups
    stations: st,
    doors: V.doors,
    buildings: V.byId,
    objects: {
      noticeBoard: board.p.group, well: well.p.group, gateWest: rec('gate_west').p.group, gateSouth: rec('gate_south').p.group,
      drawing: V.fort.drawing, tavern: rec('tavern').p.group, longhouse: rec('longhouse').p.group,
    },
  });
  V.log('anchors ready', Object.keys(L).length);
}
