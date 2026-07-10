import { supabase } from '@/lib/supabase';

type RuntimeMigrationResult = {
  applied?: string[];
  count?: number;
};

let migrationRunPromise: Promise<void> | null = null;
let migrationCompleted = false;
let migrationFailed = false;

export async function applyRuntimeMigrations(force = false) {
  if (!force) {
    if (migrationCompleted) return;
    if (migrationFailed) return;
    if (migrationRunPromise) return migrationRunPromise;
  }

  migrationRunPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc('apply_runtime_migrations');

      if (error) {
        const message = error.message ?? '';
        if (message.includes('apply_runtime_migrations')) {
          console.warn('Runtime-Migrationsfunktion fehlt. Bitte DB-Migrationen ausführen.');
          migrationFailed = true;
          return;
        }
        throw error;
      }

      const result = (data ?? {}) as RuntimeMigrationResult;
      if ((result.count ?? 0) > 0) {
        console.info('Runtime-Migrationen angewendet:', result.applied?.join(', '));
      }

      migrationCompleted = true;
    } catch (error) {
      migrationFailed = true;
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error);
      console.warn('Runtime-Migration fehlgeschlagen:', msg);
    } finally {
      migrationRunPromise = null;
    }
  })();

  return migrationRunPromise;
}
