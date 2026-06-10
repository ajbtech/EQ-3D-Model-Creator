import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Non-axis-aligned sampling directions for the inside/outside parity test.
// Axis-aligned rays land on triangle diagonals/edges of blocky EQ meshes and
// miscount; these irrational-ish directions plus a majority vote avoid that.
const VOTE_DIRECTIONS = [
  [0.513, 0.241, 0.823],
  [0.241, 0.823, -0.513],
  [-0.823, 0.513, 0.241],
  [0.371, -0.629, 0.682],
  [0.682, 0.371, 0.629],
].map((d) => new THREE.Vector3(...d).normalize());

// Build a signed-distance sampler from a triangle mesh. This is the first half of
// the PLAN.md section 6.4 print-prep stack: three-mesh-bvh closest-point for the
// distance magnitude, plus a sign test that decides inside vs outside.
//
// Convention: returns POSITIVE inside, NEGATIVE outside. This matches manifold-3d
// levelSet, which keeps the region where f > level.
//
// directions:
//   number of ray-stabbing winding samples to vote over. The default 5 is robust for
//   arbitrary OPEN / non-manifold / many-part meshes (raw EQ art). For an already
//   CLOSED mesh a single ray is exact, so pass directions=1 (used by the erosion
//   pass on the watertight dilated solid) to cut raycasts 5x with no quality loss.
export function makeSignedDistance(geometry, { directions = VOTE_DIRECTIONS.length } = {}) {
  const dirs = VOTE_DIRECTIONS.slice(0, Math.max(1, Math.min(directions, VOTE_DIRECTIONS.length)));
  const geo = geometry.index ? geometry : geometry.toNonIndexed();
  const bvh = new MeshBVH(geo);

  const point = new THREE.Vector3();
  const hit = {};
  const ray = new THREE.Ray();

  // Ray-stabbing WINDING test, voted across several directions.
  //
  // Plain parity (count crossings % 2) computes the symmetric difference of
  // overlapping closed parts: a point inside two interpenetrating sub-meshes (very
  // common in EQ models -- 13 separate body parts) crosses 4 surfaces, reads even,
  // and is wrongly classed "outside", carving spurious tunnels. Instead we sum the
  // signed crossings: +1 each time the ray exits a solid (face normal along the ray)
  // and -1 each time it enters. The net is how many solids contain the point, so
  // "inside if net >= 1" gives the UNION of all parts -- what we want for a fused,
  // printable figure. Voting over directions tolerates open sheets and grazing hits.
  function isInsideWinding(px, py, pz) {
    let votes = 0;
    for (const dir of dirs) {
      ray.origin.set(px, py, pz);
      ray.direction.copy(dir);
      const hits = bvh.raycast(ray, THREE.DoubleSide);
      let winding = 0;
      for (const h of hits) {
        winding += Math.sign(h.face.normal.x * dir.x + h.face.normal.y * dir.y + h.face.normal.z * dir.z);
      }
      if (winding >= 1) votes++;
    }
    return votes * 2 > dirs.length;
  }

  function unsignedDistance(px, py, pz) {
    point.set(px, py, pz);
    bvh.closestPointToPoint(point, hit);
    return hit.distance;
  }

  const sdf = (p) => {
    const d = unsignedDistance(p[0], p[1], p[2]);
    return isInsideWinding(p[0], p[1], p[2]) ? d : -d;
  };
  sdf.bvh = bvh;
  sdf.geometry = geo;
  return sdf;
}
