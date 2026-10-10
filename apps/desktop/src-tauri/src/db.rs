//! The library database: one SQLite connection, so a transaction spans every statement the
//! app sends between BEGIN and COMMIT. Statements, values and rows travel as JSON, with
//! bytes (covers) as `{"$bytes": "<base64>"}`, the same format as the development bridge.

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tauri::State;

pub struct Db(Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let connection = Connection::open(path)?;
        connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")?;
        Ok(Self(Mutex::new(connection)))
    }

    fn connection(&self) -> MutexGuard<'_, Connection> {
        // A panic while the lock was held leaves the connection itself intact.
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Whether the reader chose to keep fetching after the window is closed. False until
    /// the app has created its tables.
    pub fn background_fetching(&self) -> bool {
        self.connection()
            .query_row(
                "SELECT background_fetching FROM reader_preferences WHERE id = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|value| value == 1)
            .unwrap_or(false)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunRequest {
    sql: String,
    values: Vec<Value>,
    reads_rows: bool,
}

fn to_sql(value: Value) -> Result<SqlValue, String> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(flag) => SqlValue::Integer(flag.into()),
        Value::Number(number) => match number.as_i64() {
            Some(integer) => SqlValue::Integer(integer),
            None => SqlValue::Real(number.as_f64().unwrap_or_default()),
        },
        Value::String(text) => SqlValue::Text(text),
        Value::Object(object) => match object.get("$bytes") {
            Some(Value::String(encoded)) => SqlValue::Blob(
                STANDARD
                    .decode(encoded)
                    .map_err(|error| error.to_string())?,
            ),
            _ => return Err("an SQL value can't be an object".into()),
        },
        Value::Array(_) => return Err("an SQL value can't be a list".into()),
    })
}

fn from_sql(value: ValueRef) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(integer) => json!(integer),
        ValueRef::Real(real) => json!(real),
        ValueRef::Text(text) => Value::String(String::from_utf8_lossy(text).into_owned()),
        ValueRef::Blob(bytes) => json!({ "$bytes": STANDARD.encode(bytes) }),
    }
}

/// Runs one statement: `{"rows": [...], "changes": n}`, with rows only when it reads them.
#[tauri::command]
pub async fn db_run(db: State<'_, Db>, request: String) -> Result<String, String> {
    let request: RunRequest = serde_json::from_str(&request).map_err(|error| error.to_string())?;
    let values = request
        .values
        .into_iter()
        .map(to_sql)
        .collect::<Result<Vec<_>, _>>()?;
    let connection = db.connection();
    let mut statement = connection
        .prepare(&request.sql)
        .map_err(|error| error.to_string())?;
    if !request.reads_rows {
        let changes = statement
            .execute(params_from_iter(values))
            .map_err(|error| error.to_string())?;
        return Ok(json!({ "rows": [], "changes": changes }).to_string());
    }
    let names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let mut rows = statement
        .query(params_from_iter(values))
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let mut record = Map::new();
        for (index, name) in names.iter().enumerate() {
            let value = row.get_ref(index).map_err(|error| error.to_string())?;
            record.insert(name.clone(), from_sql(value));
        }
        out.push(Value::Object(record));
    }
    Ok(json!({ "rows": out, "changes": 0 }).to_string())
}

/// Runs a script of statements without values, such as a migration.
#[tauri::command]
pub async fn db_exec(db: State<'_, Db>, sql: String) -> Result<(), String> {
    db.connection()
        .execute_batch(&sql)
        .map_err(|error| error.to_string())
}
