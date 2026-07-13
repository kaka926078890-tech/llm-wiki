export type CatalogRepo = "chatkit-middleware" | "chatkit-web" | "finclaw";

export type CatalogListKind =
  | "services"
  | "apps"
  | "libs"
  | "admin-features"
  | "modules"
  | "cli"
  | "not-microservice";

/** M2: basic = basic-block only; advance = full merged edition */
export type MiddlewareEdition = "basic" | "advance";

export interface FeatureItem {
  id: string;
  title: string;
  summary?: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
  section?: string;
  /** middleware services only — which editions include this entry */
  editions?: MiddlewareEdition[];
}

export interface RepoFeatureLists {
  repo: CatalogRepo;
  generatedAt: string;
  lists: Partial<Record<CatalogListKind, FeatureItem[]>>;
}
