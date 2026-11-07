import { useEffect, useRef, useState } from "react";
// Both bundles execute the identical classic-script namespace; no second player implementation.
import "../../tv/player.js";
import "../../tv/transport.js";
export function Preview() {
  const image = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<{
    url?: string;
    message?: string;
    error?: boolean;
  }>({ message: "Connecting…" });
  useEffect(() => {
    const player = Signage.createPlayer({
      transport: Signage.createTransport({}),
      view: {
        beginTransition() {},
        clear() {
          image.current?.removeAttribute("src");
        },
        showImage: (url) => setState({ url }),
        showEmpty: () => setState({ message: "Please upload" }),
        showError: () =>
          setState({ message: "Could not connect. Retrying…", error: true }),
      },
    });
    player.start();
    return () => player.stop();
  }, []);
  return (
    <div className="preview">
      <a className="preview-back" href="/">
        ← Back to editor
      </a>
      {state.url ? (
        <img ref={image} src={state.url} alt="Display image" />
      ) : (
        <p role={state.error ? "alert" : "status"}>{state.message}</p>
      )}
    </div>
  );
}
