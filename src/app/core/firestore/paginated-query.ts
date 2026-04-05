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
  limitCount = 5000
): Promise<QueryDocumentSnapshot[]> {
  const q = query(col, ...baseConstraints, limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs;
}
