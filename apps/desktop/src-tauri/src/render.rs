//! Pages whose text only their own scripts produce, loaded in a hidden window. A script
//! injected into that window waits for the page to be ready and hands its HTML back through
//! one command, the only one the window may call (capabilities/render.json), and only from
//! the sites listed there. One page renders at a time. The window shares the app's web view
//! storage, so a site's cookies (such as a passed bot check) last from one page to the next.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

const WINDOW: &str = "render";

#[derive(Default)]
pub struct Renderer {
    /// Held while a page renders.
    turn: tokio::sync::Mutex<()>,
    /// Where the injected script's answer goes.
    answer: Mutex<Option<oneshot::Sender<Rendered>>>,
}

#[derive(Deserialize, Serialize)]
pub struct Rendered {
    url: String,
    status: u16,
    html: String,
}

/// Waits until `selector` matches (or, without one, until the page has loaded) or the time
/// is up, then sends the page back.
fn script(selector: Option<&str>, timeout: u64) -> String {
    let selector = serde_json::to_string(&selector).unwrap_or_else(|_| "null".into());
    format!(
        r#"(function () {{
  if (window.top !== window) return;
  var selector = {selector};
  var started = Date.now();
  var timer = setInterval(function () {{
    var ready = selector
      ? document.readyState !== 'loading' && document.querySelector(selector)
      : document.readyState === 'complete';
    if (!ready && Date.now() - started < {timeout}) return;
    clearInterval(timer);
    window.__TAURI_INTERNALS__.invoke('render_result', {{
      url: location.href,
      html: document.documentElement.outerHTML
    }});
  }}, 250);
}})();"#
    )
}

#[tauri::command]
pub async fn render(
    app: AppHandle,
    renderer: State<'_, Renderer>,
    url: String,
    wait_for: Option<String>,
    timeout: u64,
    user_agent: Option<String>,
) -> Result<Rendered, String> {
    let _turn = renderer.turn.lock().await;
    if let Some(stale) = app.get_webview_window(WINDOW) {
        let _ = stale.destroy();
    }
    let (sender, receiver) = oneshot::channel();
    *renderer
        .answer
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(sender);

    let address = url.parse().map_err(|error| format!("{error}"))?;
    let mut builder = WebviewWindowBuilder::new(&app, WINDOW, WebviewUrl::External(address))
        .visible(false)
        .initialization_script(script(wait_for.as_deref(), timeout));
    // Without one, the window sends the web view's own.
    if let Some(user_agent) = &user_agent {
        builder = builder.user_agent(user_agent);
    }
    let window = builder.build().map_err(|error| error.to_string())?;
    // The script answers by the timeout; this only covers a page that never loads.
    let answer = tokio::time::timeout(Duration::from_millis(timeout + 15_000), receiver).await;
    let _ = window.destroy();
    match answer {
        Ok(Ok(rendered)) => Ok(rendered),
        Ok(Err(_)) => Err("the page closed before it answered".into()),
        Err(_) => Err(format!("{url} didn't load in time")),
    }
}

#[tauri::command]
pub fn render_result(renderer: State<'_, Renderer>, url: String, html: String) {
    let sender = renderer
        .answer
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take();
    if let Some(sender) = sender {
        let _ = sender.send(Rendered {
            url,
            status: 200,
            html,
        });
    }
}

const SITE_WINDOW: &str = "site";

/// Opens a site's page (its sign-in page) in a visible window of the app. The window shares
/// the web view's cookies with the render window, so the rendered pages are signed in to
/// what the reader signs in to there. No capability names it: its pages get no commands.
/// Async, since creating a window in a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn open_site_window(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let address: tauri::Url = url.parse().map_err(|error| format!("{error}"))?;
    if address.scheme() != "https" {
        return Err(format!("{url} isn't an https page"));
    }
    if let Some(window) = app.get_webview_window(SITE_WINDOW) {
        window.navigate(address).map_err(|error| error.to_string())?;
        let _ = window.set_title(&title);
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, SITE_WINDOW, WebviewUrl::External(address))
        .title(&title)
        .inner_size(520.0, 760.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}
