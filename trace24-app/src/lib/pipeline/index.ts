/**
 * Client-safe pipeline exports only.
 * Modules that touch fs/path (load-report, evidence, vector, announce-fallback,
 * investigate, rag) must be imported from their files in Route Handlers.
 */
export * from './types';
export * from './registry';
export * from './normalize';
export * from './extract';
export * from './resolve';
export * from './graph';
export * from './detect';
export * from './risk';
export * from './rules';
export * from './facts';
