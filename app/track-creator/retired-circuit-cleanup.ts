const CLEANUP_KEY = "gridwatch.retired-circuit-editor-cleanup-v1";

/** Permanently removes storage owned by the retired Circuit Editor. */
export async function discardRetiredCircuitEditorData(): Promise<void> {
  if (typeof window === "undefined" || localStorage.getItem(CLEANUP_KEY) === "done") return;
  localStorage.removeItem("gridwatch.custom-circuits");
  localStorage.removeItem("gridwatch.circuit-migration");
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("gridwatch-circuits");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }
  localStorage.setItem(CLEANUP_KEY, "done");
}
