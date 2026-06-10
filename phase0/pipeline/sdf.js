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

// Build a signed-distance sampler from an arbitrary triangle mesh -- including
// the open, non-manifold sheets typical of EQ game art (capes, blades, hollow
// bodies). This is the first half of the PLAN.md section 6.4 print-prep stack:
// three-mesh-bvh closest-point for the distance, plus a ray-parity vote for sign.
//
// Convention: returns POSITIVE inside, NEGATIVE outside. This matches manifold-3d
// levelSet, which keeps the region where f > level.
export function makeSignedDistance(geometry) {
  const geo = geometry.index ? geometry : geometry.toNonIndexed();
  const bvh = new MeshBVH(geo);

  const point = new THREE.Vector3();
  const hit = {};
  const ray = new THREE.Ray();

  // Inside/outside by a ray-stabbing WINDING test, voted across several directions.
  //
  // Plain parity (count crossings % 2) computes the symmetric difference of
  // overlapping closed parts: a point inside two interpenetrating sub-meshes (very
  // common in EQ models -- 13 separate body parts) crosses 4 surfaces, reads even,
  // and is wrongly classed "outside", carving spurious tunnels. Instead we sum the
  // signed crossings: +1 each time the ray exits a solid (face normal along the ray)
  // and -1 each time it enters. The net is how many solids contain the point, so
  // "inside if net >= 1" gives the UNION of all parts -- what we want for a fused,
  // printable figure. Voting over directions tolerates open sheets and grazing hits.
  function isInside(px, py, pz) {
    let votes = 0;
    for (const dir of VOTE_DIRECTIONS) {
      ray.origin.set(px, py, pz);
      ray.direction.copy(dir);
      const hits = bvh.raycast(ray, THREE.DoubleSide);
      let winding = 0;
      for (const h of hits) {
        winding += Math.sign(h.face.normal.x * dir.x + h.face.normal.y * dir.y + h.face.normal.z * dir.z);
      }
      if (winding >= 1) votes++;
    }
    return votes * 2 > VOTE_DIRECTIONS.length;
  }

  function unsignedDistance(px, py, pz) {
    point.set(px, py, pz);
    bvh.closestPointToPoint(point, hit);
    return hit.distance;
  }

  const sdf = (p) => {
    const d = unsignedDistance(p[0], p[1], p[2]);
    return isInside(p[0], p[1], p[2]) ? d : -d;
  };
  sdf.bvh = bvh;
  sdf.geometry = geo;
  return sdf;
}
