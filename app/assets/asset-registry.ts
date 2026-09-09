export type RuntimeAsset = {
  id: string; family: string; path: string; preloadPriority: "critical" | "on-demand"; fallbackAsset: string | null;
  dimensions?: { width: number; height: number }; contentHash?: string;
};
type RuntimeManifest = { version: 2; assetVersion: string; assets: RuntimeAsset[] };

class AssetRegistry {
  private manifest: RuntimeManifest | null = null;
  private images = new Map<string, Promise<HTMLImageElement | null>>();
  private diagnostics = new Map<string, string>();

  async loadManifest(signal?: AbortSignal) {
    if (this.manifest) return this.manifest;
    const response = await fetch("/assets/gridwatch-asset-manifest.json", { signal, cache: "force-cache" });
    if (!response.ok) throw new Error(`Asset manifest returned ${response.status}.`);
    const manifest = await response.json() as RuntimeManifest;
    if (manifest.version !== 2 || !Array.isArray(manifest.assets)) throw new Error("Unsupported asset manifest.");
    this.manifest = manifest;
    return manifest;
  }

  async preloadCritical(signal?: AbortSignal) {
    try {
      const manifest = await this.loadManifest(signal);
      await Promise.all(manifest.assets.filter((asset) => asset.preloadPriority === "critical").map((asset) => this.loadImage(asset.id, signal)));
    } catch (error) {
      if (!signal?.aborted) this.diagnostics.set("manifest", error instanceof Error ? error.message : "Asset preload failed.");
    }
  }

  async loadImage(id: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
    if (this.images.has(id)) return this.images.get(id)!;
    const promise = this.resolveImage(id, signal);
    this.images.set(id, promise);
    return promise;
  }

  private async resolveImage(id: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
    const manifest = await this.loadManifest(signal);
    const asset = manifest.assets.find((item) => item.id === id);
    if (!asset || signal?.aborted) return null;
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Could not decode ${id}.`)); image.src = asset.path; });
    } catch (error) {
      this.diagnostics.set(id, error instanceof Error ? error.message : "Asset decode failed.");
      return asset.fallbackAsset && asset.fallbackAsset !== id ? this.loadImage(asset.fallbackAsset, signal) : null;
    }
  }

  getDiagnostics() { return new Map(this.diagnostics); }
  get revision() { return this.manifest?.assetVersion ?? null; }
}

export const assetRegistry = new AssetRegistry();
