# Marzena Village: Composition Plan

For the locations builder. Coordinates are meters (see layout.js). `yaw` is the direction the
front door faces: 0 = south (+Z), PI = north (-Z), PI/2 = east (+X), -PI/2 = west (-X).
Positions are targets; nudge by up to 3 m to fit terrain and roads, never onto a road.

## Big picture
- The village sits on a gentle slope from the shore (z ~ 55, y ~ 2.5) up to the south (z ~ 175, y ~ 6.5).
- **Main street** (road `pass` then `mill`) runs west to east: west gate (-88, 128), square (0, 118), east toward the mill.
- **North lane** drops from the square to the shore huts. **South lane** climbs to the shrine. **West lane** goes to Dobra's.
- A low **palisade** of sharpened logs wraps the south and west sides (not the shore). The **west
  gate** is the hero entrance: a timber gate with a roof, carved posts, a lantern, an effigy
  hung on a pole beside it.
- Houses cluster in irregular groups with yards (woodpiles, sleds, pens), not a grid. Trampled
  snow paths connect doors to streets. Leave small open yards and one snowy empty lot.
- Sightlines: from the square you should see the lake and the bell tower to the north between
  the longhouse and the tavern, and the idol hill to the southeast over rooftops.

## Hero buildings
| Building | Position | yaw | Notes |
|---|---|---|---|
| Reeve's longhouse | (5, 90) | 0 | 20 x 9, carved gables, horse-head finials, faces the square; cellar trapdoor behind the hearth |
| The Drowned Bell (tavern) | (-34, 104) | 0 | Hanging bell sign on the corner post; benches outside; enterable |
| Smithy | (33, 128) | PI | Open forge side toward the street, glowing hearth, anvil yard |
| Shrine (chram) | (-5, 168) | 0 | Ring of 8 carved posts, fire pit, small roofed altar with offerings |
| Dobra's workshop + hut | (-74, 152) | PI/2 | Open barn full of straw, effigies hanging from beams, half-made ones in the yard, straw bales for the children (C3) |
| Hanka's house | (80, 70) | -PI/2 + 0.4 | Small, apart, on the shore; bowl of milk on the ice below her steps; enterable |
| Banya | (-50, 72) | 0 | Steam from the roof vent, a cold-plunge hole in the ice nearby |
| Notice board | (9, 113) | PI | At the square's northeast corner, two papers |
| Well | (0, 118) | 0 | Center of the square, roofed, bucket on a chain |

## Houses (log houses, vary size 6x5 to 9x7, 1 to 2 floors, porches on half)
North of the main street: (-60, 100) yaw 0; (-46, 86) 0.3; (-76, 84) -0.2; (25, 99) 0; (45, 92) -0.15; (31, 75) 0.1; (-30, 82) 0.2.
South of the main street: (-40, 141) PI; (-22, 146) PI; (18, 146) PI+0.1; (45, 141) PI; (62, 124) -PI/2; (-56, 166) PI/2; (20, 169) PI; (66, 152) PI; (-96, 106) PI/2.

## Outbuildings
Granary on posts (12, 159); barns (-86, 160) and (76, 140); a stable for Kasza near the gate (-72, 120); 3 sheds and 2 outhouses in back yards; goat pen (36, 158) with a **goat standing on the shed roof**; chicken coop (-48, 152); market stalls around the square (3 or 4, mostly bare: dried fish, carved spoons, straw dolls, one empty stall with a sign "BREAD 3 GR"); drying racks of fish between houses on the north side.

## Shore
Fishing huts on stilts at x = -90, -70, -30, -10, 12, 35 (z ~ 52 to 56), half over the ice,
connected by a **boardwalk** along the shore (road `shore`). Boathouse (50, 58). Boats frozen
in the ice. Net racks. Under the boardwalk near (-20, 60): the **kids' fort** (crates, a
blanket, the charcoal drawing note). Ice-fishing camp out at LOC.iceCamp.

## Edges
Graveyard (95, 166) outside the palisade on the idol path: carved wooden grave posts with
little roofs, a newer one for Mateusz Kral, Wiesia's empty grave with red-thread flowers.
Snowed fields with split-rail fences southeast (30..90, 175..215). Sledding hill (-40, 208)
with sled tracks and a few sleds. Firewood stumps at the forest edge (thinned for fuel).

## NPC stations (register in `G.world.stations`)
Wood chopping (2 yards), forge (smith hammering), well (drawing water), market stalls (2 sellers),
tavern interior (Zbyszek behind the bar, 3 drinkers, Jarek in the corner at night), tavern
benches outside, fish racks (2 women), net mending on the boardwalk (2 fishermen), ice holes at
the camp (3 fishermen by day), Dobra's workshop (Dobra + children stuffing straw), shrine (an
old woman praying), sledding hill (children by day), porch benches (elders), the reeve's table,
Hanka's loom / table, laundry line, snow shoveling, goat pen, beds indoors (night, hidden).

## Dressing density targets
Every porch: at least 3 props (firewood, bucket, sled, broom, skis, lantern). Every yard: a
woodpile and one thing that tells a story (a broken cart, a child's snowman, frozen laundry).
Lanterns on posts along the main street (lit at dusk). Chimney smoke on every inhabited house.
Paths of trampled snow. No two adjacent houses identical.
