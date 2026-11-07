import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Playlist } from "../../shared/contracts";
import * as api from "./api";
import "./style.css";

function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputKey, setInputKey] = useState(0);
  function expired(error: unknown) {
    if (error instanceof api.ApiError && error.status === 401) {
      setSignedIn(false);
      setPlaylist(null);
      setFiles([]);
      setError("Your session ended. Please sign in again.");
      return true;
    }
    return false;
  }
  async function refresh() {
    setPlaylist(await api.getPlaylist());
  }
  useEffect(() => {
    void (async () => {
      try {
        await api.getSession();
        setSignedIn(true);
        await refresh();
      } catch (error) {
        if (!expired(error))
          setError("Could not connect. Reload to try again.");
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function mutate(action: () => Promise<Playlist>) {
    setBusy(true);
    setError("");
    try {
      setPlaylist(await action());
      setFiles([]);
      setInputKey((key) => key + 1);
    } catch (error) {
      if (!expired(error)) {
        setError(
          error instanceof api.ApiError && error.status === 409
            ? "The playlist changed. Refreshed the latest images; try again."
            : "Could not save your change. Refreshing the playlist; please try again.",
        );
        try {
          await refresh();
        } catch (refreshError) {
          if (!expired(refreshError)) {
            setPlaylist(null);
            setError(
              "Could not verify the playlist. Reload before making another change.",
            );
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function upload() {
    if (!playlist) return;
    if (!files.length) {
      setError("Choose at least one image.");
      return;
    }
    if (files.length + playlist.images.length > 5) {
      setError(
        "A maximum of five images is allowed. Delete an image to make room.",
      );
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Each image must be 10 MB or smaller.");
      return;
    }
    void mutate(() => api.uploadImages(files));
  }
  function move(index: number, offset: number) {
    if (!playlist) return;
    const ids = playlist.images.map((image) => image.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void mutate(() => api.reorderImages(ids));
  }
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ◧ <span>SIGNAGE</span>
        </a>
        {signedIn && (
          <button
            className="quiet"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api.logout();
                setSignedIn(false);
                setPlaylist(null);
                setFiles([]);
              } catch (error) {
                if (!expired(error))
                  setError("Could not log out. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Log out
          </button>
        )}
      </header>
      {!ready ? (
        <p role="status">Connecting…</p>
      ) : !signedIn ? (
        <section className="login">
          <p className="eyebrow">YOUR SCREEN, CURATED</p>
          <h1>Welcome back.</h1>
          <p className="muted">Sign in to manage the images on your display.</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api.login(password);
                setPassword("");
                setSignedIn(true);
                try {
                  await refresh();
                } catch (playlistError) {
                  if (!expired(playlistError)) {
                    setPlaylist(null);
                    setError(
                      "Could not load the playlist. Reload to try again.",
                    );
                  }
                }
              } catch (error) {
                setError(
                  error instanceof api.ApiError && error.status === 401
                    ? "Incorrect password. Please try again."
                    : "Could not sign in. Check your connection or try again later.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </section>
      ) : (
        <>
          <div className="heading">
            <div>
              <p className="eyebrow">DISPLAY CONTENT</p>
              <h1>Image library</h1>
              <p className="muted">
                Arrange your images in the order they’ll appear.
              </p>
            </div>
            <span className="count">
              {playlist ? `${playlist.images.length} / 5` : "Unavailable"}
            </span>
          </div>
          <section className="upload" aria-label="Add images">
            <div>
              <h2>Add something new</h2>
              <p className="muted">
                JPEG, PNG or static WebP · Up to 10 MB each
              </p>
            </div>
            <label className="file-label">
              Choose images
              <input
                key={inputKey}
                aria-label="Choose images"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || !playlist}
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []));
                  setError("");
                }}
              />
            </label>
            {files.length > 0 && (
              <ul className="pending">
                {files.map((file, index) => (
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
            )}
            <button disabled={busy || !playlist} onClick={upload}>
              {busy ? "Saving…" : "Upload images"}
            </button>
          </section>
          {playlist && !playlist.images.length && (
            <section className="empty">
              <h2>A blank canvas.</h2>
              <p className="muted">
                Upload your first image to bring your display to life.
              </p>
            </section>
          )}
          <div className="grid">
            {playlist?.images.map((image, index) => (
              <article key={image.id} data-id={image.id}>
                <div className="thumbnail">
                  <img src={image.path} alt={`Display image ${index + 1}`} />
                </div>
                <div className="card-content">
                  <p className="image-title">
                    Image {index + 1}
                    <span className="position">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </p>
                  <p className="identifier" title={image.id}>
                    {image.id}
                  </p>
                  <div className="actions">
                    <button
                      aria-label={`Move image ${index + 1} up`}
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑ Up
                    </button>
                    <button
                      aria-label={`Move image ${index + 1} down`}
                      disabled={busy || index === playlist.images.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓ Down
                    </button>
                    <button
                      className="delete"
                      aria-label={`Delete image ${index + 1}`}
                      disabled={busy}
                      onClick={() =>
                        void mutate(() => api.removeImage(image.id))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {signedIn && <footer>Images play in order · 2 seconds per image</footer>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
