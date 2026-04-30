// Re-export the canonical classifier. Source of truth lives next to the
// edge function at supabase/functions/_shared/ so Deno's bundler can resolve
// it; Vite resolves the relative path here for the React app. Keeping a
// single physical file guarantees server/client vocabulary cannot drift.
export * from '../../supabase/functions/_shared/hubspot-retry-classifier';
