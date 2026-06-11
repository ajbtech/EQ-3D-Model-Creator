// Resolve a curated pose definition against the animation clips actually present in
// a user-supplied glTF.
//
// EQ exports carry ~70 named clips; our UI offers a handful of curated poses (PLAN.md
// section 5), each defined as an ordered list of candidate clip names plus a frame
// position. We pick the first candidate that exists in this model and convert the
// frame fraction (0..1 of the clip) into seconds. Returns null when none match, so
// the UI can disable that pose.
//
// `clips`   : array of objects with `.name` and `.duration` (THREE.AnimationClip fits).
// `poseDef` : { clipCandidates: string[], frame?: number (0..1, default 0.5) }
export function resolvePose(clips, poseDef) {
  if (!clips || clips.length === 0) return null;
  const candidates = poseDef?.clipCandidates ?? [];
  const frame = poseDef?.frame ?? 0.5;

  for (const name of candidates) {
    const clip = clips.find((c) => c.name === name);
    if (clip) {
      return { clipName: clip.name, time: frame * clip.duration };
    }
  }
  return null;
}
