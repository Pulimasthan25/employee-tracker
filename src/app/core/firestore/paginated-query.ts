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
 * Fetches documents matching `baseConstraints` up to a fixed limit.
 * Used to manage Firebase read costs.
 */
export async function getDocsAllPages(
  col: CollectionReference,
  baseConstraints: QueryConstraint[],
  limitCount = 500
): Promise<QueryDocumentSnapshot[]> {
  const q = query(col, ...baseConstraints, limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs;
}
