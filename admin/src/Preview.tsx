import { useEffect, useRef, useState } from "react";
// TV and preview share playback timing, transport and DOM image rendering.
import "../../tv/player.js";
import "../../tv/image-view.js";
import "../../tv/transport.js";
export function Preview() {
  const base = useRef<HTMLImageElement>(null);
  const incoming = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<{ message?: string; error?: boolean }>({
    message: "Connecting…",
  });
  useEffect(() => {
    const images = Signage.createImageView(base.current!, incoming.current!);
    const player = Signage.createPlayer({
      transport: Signage.createTransport({}),
      view: {
        beginTransition: images.beginTransition,
        clear: images.clear,
        showImage(url) {
          images.showImage(url);
          setState({});
        },
        showEmpty: () => setState({ message: "Please upload" }),
        showError: () =>
          setState({ message: "Could not connect. Retrying…", error: true }),
      },
    });
    player.start();
    return () => {
      player.stop();
      images.dispose();
    };
  }, []);
  return (
    <div className="preview">
      <a className="preview-back" href="/">← Back to editor</a>
      <img ref={base} alt="Display image" hidden />
      <img ref={incoming} alt="" aria-hidden="true" hidden />
      {state.message && <p role={state.error ? "alert" : "status"}>{state.message}</p>}
    </div>
  );
}
