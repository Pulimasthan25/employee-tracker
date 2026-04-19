import {
  getDocs,
  limit,
  query,
  type CollectionReference,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

/**
 * Fetches documents matching `baseConstraints` up to a fixed limit.
 * This is intentionally capped at 500 records to manage Firebase Free Tier read limits.
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
