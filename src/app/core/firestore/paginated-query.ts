import {
  collection,
  getDocs,
  limit,
  query,
  startAfter,
  type CollectionReference,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

/**
 * Fetches documents matching `baseConstraints` by paginating through all available results.
 * Prevents silent truncation that occurs when using a single limit() on large datasets.
 */
export async function getDocsAllPages(
  col: CollectionReference,
  baseConstraints: QueryConstraint[],
  pageSize = 1000
): Promise<QueryDocumentSnapshot[]> {
  const allDocs: QueryDocumentSnapshot[] = [];
  let lastDoc: QueryDocumentSnapshot | null = null;
  let hasMore = true;
  const MAX_DOCS = 50000; // Increased limit to support larger team ranges (approx 100+ hours of activity)

  while (hasMore && allDocs.length < MAX_DOCS) {
    const q: Query = lastDoc
      ? query(col, ...baseConstraints, startAfter(lastDoc), limit(pageSize))
      : query(col, ...baseConstraints, limit(pageSize));

    const snap: QuerySnapshot = await getDocs(q);
    
    if (snap.empty) {
      hasMore = false;
    } else {
      allDocs.push(...snap.docs);
      lastDoc = snap.docs[snap.docs.length - 1];
      
      // If we got fewer than requested, we reached the end
      if (snap.docs.length < pageSize) {
        hasMore = false;
      }
    }
  }

  return allDocs;
}
