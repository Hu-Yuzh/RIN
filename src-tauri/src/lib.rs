use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn save_backup(app: tauri::AppHandle, payload: String, kind: String) -> Result<String, String> {
    let automatic = kind == "automatic";
    let directory: PathBuf = if automatic {
        app.path().app_config_dir().map_err(|error| error.to_string())?.join("backups")
    } else {
        app.path().document_dir().map_err(|error| error.to_string())?.join("铃RIN备份")
    };
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis();
    let prefix = if automatic { "rihe-auto" } else { "rihe-backup" };
    let path = directory.join(format!("{prefix}-{stamp}.json"));
    fs::write(&path, payload).map_err(|error| error.to_string())?;

    if automatic {
        let mut files: Vec<_> = fs::read_dir(&directory)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("rihe-auto-"))
            .collect();
        files.sort_by_key(|entry| entry.file_name());
        let remove_count = files.len().saturating_sub(10);
        for entry in files.into_iter().take(remove_count) {
            let _ = fs::remove_file(entry.path());
        }
    }

    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_backup_history",
            sql: include_str!("../migrations/0002_backup_history.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_backup])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:rihe.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Rin");
}
