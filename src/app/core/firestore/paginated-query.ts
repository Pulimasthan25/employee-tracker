import {
  collection,
  getDocs,
  limit,
  query,
  startAfter,
  type CollectionReference,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

/**
 * Fetches all documents matching `baseConstraints` using fixed-size pages.
 * Avoids silent truncation from a single limit(N) on large date ranges or teams.
 */
export async function getDocsAllPages(
  col: CollectionReference,
  baseConstraints: QueryConstraint[],
  pageSize = 500
): Promise<QueryDocumentSnapshot[]> {
  const out: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    const pageConstraints: QueryConstraint[] = last
      ? [...baseConstraints, startAfter(last), limit(pageSize)]
      : [...baseConstraints, limit(pageSize)];
    const q = query(col, ...pageConstraints);
    const snap = await getDocs(q);
    if (snap.empty) break;
    out.push(...snap.docs);
    if (snap.docs.length < pageSize) break;
    last = snap.docs[snap.docs.length - 1]!;
  }
  return out;
}
