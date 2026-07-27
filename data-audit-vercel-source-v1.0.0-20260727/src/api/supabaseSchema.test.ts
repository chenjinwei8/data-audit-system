import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../../supabase-schema.sql', import.meta.url), 'utf8');

describe('Supabase foreign key deletion rules', () => {
  it('cascades declaration and acceptance links when a service order is deleted', () => {
    expect(schema).toContain(
      "('declare_service', 'service_order_id', 'service_order', 'das_declare_service_service_fkey', 'CASCADE')",
    );
    expect(schema).toContain(
      "('accept_service', 'service_order_id', 'service_order', 'das_accept_service_service_fkey', 'CASCADE')",
    );
  });

  it('replaces existing foreign keys whose delete action is outdated', () => {
    expect(schema).toContain('existing_fk.confdeltype = expected_delete_action');
    expect(schema).toContain("DROP CONSTRAINT %I', fk.source_name, existing_fk.conname");
  });
});
