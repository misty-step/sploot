package recovery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"reflect"

	"github.com/jackc/pgx/v5"
)

const userNamespace = `n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'`

func collectInventory(ctx context.Context, tx pgx.Tx) (Inventory, error) {
	inventory := Inventory{Tables: []TableInventory{}, Sequences: []SequenceInventory{}}
	rows, err := tx.Query(ctx, `SELECT n.nspname, c.relname, c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE `+userNamespace+` AND c.relkind IN ('r','p','m') ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"`)
	if err != nil {
		return inventory, databaseError("database-inventory", err)
	}
	for rows.Next() {
		var table TableInventory
		if err := rows.Scan(&table.Schema, &table.Name, &table.Kind); err != nil {
			rows.Close()
			return inventory, databaseError("database-inventory", err)
		}
		inventory.Tables = append(inventory.Tables, table)
	}
	if err := rows.Err(); err != nil {
		return inventory, databaseError("database-inventory", err)
	}
	rows.Close()
	for i := range inventory.Tables {
		table := &inventory.Tables[i]
		name := pgx.Identifier{table.Schema, table.Name}.Sanitize()
		// Canonical JSONB has stable key order, preserves NULLs, vector values,
		// token hashes and migration records, and is independent of row order.
		// ONLY avoids counting partition/inheritance rows twice.
		query := `SELECT value FROM (SELECT to_jsonb(t)::text AS value FROM ONLY ` + name + ` t) records ORDER BY value COLLATE "C"`
		count, checksum, err := hashRows(ctx, tx, query)
		if err != nil {
			return inventory, err
		}
		table.Rows, table.SHA256 = count, checksum
	}
	sequences, err := collectSequences(ctx, tx)
	if err != nil {
		return inventory, err
	}
	inventory.Sequences = sequences
	_, inventory.CatalogSHA256, err = hashRows(ctx, tx, catalogQuery)
	return inventory, err
}

func hashRows(ctx context.Context, tx pgx.Tx, query string) (int64, string, error) {
	rows, err := tx.Query(ctx, query)
	if err != nil {
		return 0, "", databaseError("database-inventory", err)
	}
	defer rows.Close()
	hash := sha256.New()
	var count int64
	var row []byte
	for rows.Next() {
		if err := rows.Scan(&row); err != nil {
			return 0, "", databaseError("database-inventory", err)
		}
		_, _ = hash.Write(row)
		_, _ = hash.Write([]byte{'\n'})
		count++
	}
	if err := rows.Err(); err != nil {
		return 0, "", databaseError("database-inventory", err)
	}
	return count, hex.EncodeToString(hash.Sum(nil)), nil
}

func collectSequences(ctx context.Context, tx pgx.Tx) ([]SequenceInventory, error) {
	sequences := []SequenceInventory{}
	rows, err := tx.Query(ctx, `SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE `+userNamespace+` AND c.relkind='S' ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"`)
	if err != nil {
		return nil, databaseError("database-inventory", err)
	}
	for rows.Next() {
		var sequence SequenceInventory
		if err := rows.Scan(&sequence.Schema, &sequence.Name); err != nil {
			rows.Close()
			return nil, databaseError("database-inventory", err)
		}
		sequences = append(sequences, sequence)
	}
	if err := rows.Err(); err != nil {
		return nil, databaseError("database-inventory", err)
	}
	rows.Close()
	for i := range sequences {
		sequence := &sequences[i]
		if err := tx.QueryRow(ctx, `SELECT last_value, is_called FROM `+pgx.Identifier{sequence.Schema, sequence.Name}.Sanitize()).Scan(&sequence.LastValue, &sequence.IsCalled); err != nil {
			return nil, databaseError("database-inventory", err)
		}
	}
	return sequences, nil
}

func compareInventory(expected, actual Inventory) error {
	if !reflect.DeepEqual(expected.Tables, actual.Tables) {
		for i, table := range expected.Tables {
			if i >= len(actual.Tables) || table != actual.Tables[i] {
				return failure("restore-verify", "database table set, row count, or row SHA-256 differs from the snapshot")
			}
		}
		return failure("restore-verify", "restored database contains unexpected tables")
	}
	if !reflect.DeepEqual(expected.Sequences, actual.Sequences) {
		return failure("restore-verify", "restored sequence state differs from the snapshot")
	}
	if expected.CatalogSHA256 != actual.CatalogSHA256 {
		return failure("restore-verify", "restored schema, constraints, indexes, triggers, functions, types, or extension versions differ from the snapshot")
	}
	return nil
}

// Object ownership and grants are deliberately excluded: isolated restore uses
// its target role, not production roles. Application owner IDs and identity rows
// are ordinary table data and are compared byte-for-byte above.
const catalogQuery = `
WITH definitions AS (
 SELECT jsonb_build_array('schema', n.nspname)::text AS value FROM pg_namespace n
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 UNION ALL
 SELECT jsonb_build_array('relation', n.nspname, c.relname, c.relkind, c.relpersistence,
   c.relrowsecurity, c.relforcerowsecurity, c.relreplident, c.reloptions,
   CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) ELSE NULL END,
   CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) ELSE NULL END,
   CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound,c.oid) ELSE NULL END)::text
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN ('r','p','m','v','S','f')
 UNION ALL
 SELECT jsonb_build_array('column', n.nspname, c.relname,
   (SELECT count(*) FROM pg_attribute preceding WHERE preceding.attrelid=c.oid AND preceding.attnum>0 AND preceding.attnum<=a.attnum AND NOT preceding.attisdropped), a.attname,
   format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
   pg_get_expr(d.adbin,d.adrelid), cn.nspname,co.collname)::text
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','m','v','f')
 UNION ALL
 SELECT jsonb_build_array('constraint', n.nspname, co.conname, c.relname, t.typname, pg_get_constraintdef(co.oid,true),co.convalidated)::text
 FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace
 LEFT JOIN pg_class c ON c.oid=co.conrelid LEFT JOIN pg_type t ON t.oid=co.contypid
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 UNION ALL
 SELECT jsonb_build_array('index', n.nspname,c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)::text
 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 UNION ALL
 SELECT jsonb_build_array('trigger', n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true))::text
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND NOT t.tgisinternal
 UNION ALL
 SELECT jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid))::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND p.prokind IN ('f','p')
 UNION ALL
 SELECT jsonb_build_array('type',n.nspname,t.typname,t.typtype,format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,
   (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))::text
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND t.typtype IN ('e','d')
 UNION ALL
 SELECT jsonb_build_array('extension',e.extname,e.extversion,n.nspname)::text FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
 UNION ALL
 SELECT jsonb_build_array('policy',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,
   pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 UNION ALL
 SELECT jsonb_build_array('sequence',n.nspname,c.relname,format_type(s.seqtypid,NULL),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)::text
 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
) SELECT value FROM definitions ORDER BY value COLLATE "C"`

func ensureEmptyTarget(ctx context.Context, conn *pgx.Conn, source DatabaseIdentity) error {
	var name string
	var version int
	var occupied bool
	if err := conn.QueryRow(ctx, `SELECT current_database(),current_setting('server_version_num')::int`).Scan(&name, &version); err != nil {
		return databaseError("restore-safety", err)
	}
	if name == source.Name {
		return failure("restore-safety", "source database is never a restore target")
	}
	if version/10000 < source.ServerVersion/10000 {
		return failure("restore-safety", "target PostgreSQL major version is older than the source")
	}
	query := `SELECT
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_') OR
 EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_') OR
 EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_') OR
 EXISTS(SELECT 1 FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname !~ '^pg_') OR
 EXISTS(SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql') OR
 EXISTS(SELECT 1 FROM pg_foreign_server) OR EXISTS(SELECT 1 FROM pg_event_trigger) OR
 EXISTS(SELECT 1 FROM pg_publication) OR EXISTS(SELECT 1 FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database())) OR
 EXISTS(SELECT 1 FROM pg_largeobject_metadata)`
	if err := conn.QueryRow(ctx, query).Scan(&occupied); err != nil {
		return databaseError("restore-safety", err)
	}
	if occupied {
		return failure("restore-safety", "target contains existing objects; create a new empty database (pgvector must be installed on the server, not pre-created in this database)")
	}
	var sessions bool
	if err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())`).Scan(&sessions); err != nil {
		return databaseError("restore-safety", err)
	}
	if sessions {
		return failure("restore-safety", "target has other sessions; stop all application and indexing connections before restoring")
	}
	return nil
}
