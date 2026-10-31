# Black-hole playground

The main playground uses numerically integrated timelike geodesics in a fixed,
non-spinning Schwarzschild spacetime. This replaces the main page's Newtonian
many-body dynamics. The old mechanics modules remain for existing snapshot
contracts and regression tests; they do not drive the black-hole playground.

## Model and units

Use ingoing Painlevé–Gullstrand coordinates. Distances are in horizon radii
`r_s = 2GM/c²`; coordinate time and proper time are in `r_s/c`. With `c = r_s = 1`,
the exact line element is `ds² = -dt² + |dq + n/sqrt(r) dt|²`, where
`r = |q|` and `n = q/r`. These coordinates are regular at the future horizon.

For a massive test particle with canonical spatial momentum `p`, define
`gamma = sqrt(1 + |p|²)` and `p_r = p·n`. Hamilton's equations are:

```
H = gamma - p_r/sqrt(r)
dq/dt = p/gamma - n/sqrt(r)
dp/dt = (p - 1.5 p_r n) / r^(3/2)
dτ/dt = 1/gamma
```

Energy `H` and angular momentum `q × p` are conserved. Outward-momentum energy
is evaluated with a rationalized expression to avoid subtracting large, nearly
equal numbers near the horizon. Integration uses RK4 step doubling with local
error control. The clock advances only by the amount actually integrated.
Crossings are localized at `r = 1`; captured probes stop there. The black hole
does not grow, and no trajectory is continued to the singularity.

Launch velocities are measured by a local hovering observer, not a coordinate
velocity. Launches must be outside `1.05 r_s` and at or below `0.95c`. A circular
timelike orbit exists for `r > 1.5 r_s` and is stable for `r > 3 r_s`; the ISCO
is at `3 r_s`. Displayed probe sizes are markers, not physical radii.

The default physical scale is a `4.154 million solar mass` black hole. The Mass
control accepts `10` to `10 billion` solar masses. `r_s`, its light-crossing time,
and the displayed physical distances all use the chosen mass.

## Mass controls

Object rest mass is entered in Earth masses and is applied to the selected
active object and new placements. Rest mass does not multiply the specific
canonical momentum or acceleration: massive test particles with identical
initial states follow the same geodesic. Their physical conserved energy and
angular momentum scale as `m c² H` and `m c r_s (q × p)`.

The combined active mass-energy satisfies `sum(m max(1, H)) <= 10^-6 M_BH`.
Invalid changes are rejected without changing the world or the camera. This
keeps the assigned masses in the test-particle regime; mutual gravity and
backreaction remain outside this model.

Applying a black-hole mass selects a new static background, preserving active
objects' positions in meters and their local hovering-frame four-velocities.
It is a comparison of initial conditions, not simulated accretion or an evolving
spacetime. Coordinates scale by `r_s_old / r_s_new`. The canonical momentum is
rebuilt directly from the local tetrad four-velocity, so a near-horizon speed
rounded to `c` does not destroy the Lorentz factor. Camera position, scale,
and zoom bounds change with the coordinate units; zoom can still reach the new
horizon scale. Clocks, trails, and invariant baselines restart.

Objects already inside the new horizon become inactive with a resize-capture
label, distinct from a numerically integrated horizon crossing. Previous captures
remain inactive, even if a smaller horizon would put their old positions outside
it. A requested reinitialization at `1 < r_new < 1.0001` is rejected to avoid an
ill-conditioned hovering-frame conversion; no outside object is falsely captured.

The solver retains its strong-field timestep cap inside `20 r_s`. Farther out,
the cap grows as `maxStep * r_min / 20`, while the shared error test still accepts
or rejects every interval. This supports reducing the mass at fixed physical
distances without spending the whole frame budget on negligible weak-field motion.
Mixed near/far scenes can still slow under the accuracy hold. Mass changes keep
the current physical playback rate; new scenes and new near-hole placements
use mass-scaled playback choices when needed for an interactive rate.

## Scope

Each probe is independent and has negligible mass. There is no mutual gravity,
black-hole spin, charge, backreaction, comparable-mass merger, gravitational-wave
emission, tidal disruption, or fluid model. This is an exact background metric,
not a numerical solution for an evolving many-body spacetime.

The orthographic camera shows spatial coordinates on a PG time slice, with depth
and occlusion. It does not trace photons: no lensing, optical shadow, light-travel
delay, or Doppler image is claimed. Proper time is integrated along each probe;
PG coordinate time is not an observed light-arrival time.

## Interaction

- Place orbit is the default: click/tap empty space outside `3 r_s` to place a
  stable circular probe using the calculated local orbital speed. Hover shows
  the proposed radius, orbit guide and tangential velocity. Click a probe to select it.
- A left/one-finger drag rotates after a six-pixel threshold and never places a
  probe. Right-drag, middle-drag, or Shift-drag pans. The wheel zooms.
- Touch: two fingers pan and pinch to zoom.
- Free launch is separate: drag from outside the horizon to set local velocity.
  It can produce a plunge or escape. Alt-drag rotates while this tool is active.
- Rotation preserves the black hole's screen position after pan/zoom. Reset view
  frames bound probes; an escaping free launch does not set the zoom extent.
- Keyboard: arrows rotate, Shift-arrows pan, `+` / `-` zoom, Home resets,
  and Space pauses. Bracket keys select probes. In Place orbit, pan to aim the
  center crosshair and press Enter. In Free launch, press Enter, set velocity
  with arrows, then press Enter again; Escape cancels.
- Demo sign-in and local sign-out remain unchanged. No accounts or saved data
  are created by the playground.
- The Mass button opens black-hole and object mass controls. Applying black-hole
  mass keeps current positions and local velocities; object mass changes do not
  reset clocks or move the selected object.

## Verification

Run `node schwarzschild.test.mjs`, `node orbit-camera.test.mjs`, and
`node orbit-placement.test.mjs`, and `node blackhole-mass.test.mjs`.
Analytic checks cover circular frequency and clock rate; ISCO energy and angular
momentum; constant-momentum radial infall and its finite PG crossing time;
local-speed conversion; energy/angular-momentum drift; three-dimensional
rotational covariance; timestep convergence; and the bounded integration clock.
Placement checks create real probes through the camera conversion at three
radii and three camera poses, then verify circular radius through four periods.
Camera checks cover rotation after pan and pointer-anchored zoom without pivot drift.
Mass checks cover physical-state preservation, energy/angular-momentum units,
rest-mass independence, atomic validation, near-horizon remapping, capture reasons,
weak-field stepping, and zoom across different black-hole masses.
Browser checks cover orbiting, pan, tilt, zoom, launch, pause, touch controls,
responsive layout, and demo sign-out.

## Sources

- [Kanai, Siino and Hosoya, Gravitational collapse in Painlevé–Gullstrand coordinates, eq. 6](https://s3.cern.ch/inspire-prod-files-5/5b3f3df8799df45808a7f46124d53807)
- [David Tong, General Relativity, geodesics and Schwarzschild circular orbits](https://www.damtp.cam.ac.uk/user/tong/gr/grhtml/S1.html)

The Hamilton equations above are derived from the stated metric. Benchmarks,
model limits, and displayed measurements must remain consistent with it.
