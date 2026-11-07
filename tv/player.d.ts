import type { Playlist } from "../shared/contracts";
export interface LoadedImage {
  url: string;
  release(): void;
}
export interface Transport {
  getPlaylist(signal?: AbortSignal): Promise<Playlist>;
  loadImage(path: string, signal?: AbortSignal): Promise<LoadedImage>;
}
export interface Player {
  start(): void;
  stop(): void;
}
declare global {
  var Signage: {
    createPlayer(options: {
      transport: Transport;
      clock?: {
        setTimeout(fn: () => void, ms: number): any;
        clearTimeout(id: any): void;
      };
      view: {
        showImage(url: string): void;
        beginTransition(url: string, durationMs: number): void;
        clear(): void;
        showEmpty(): void;
        showError(): void;
      };
    }): Player;
    createImageView(base: HTMLImageElement, incoming: HTMLImageElement): {
      showImage(url: string): void;
      beginTransition(url: string, durationMs: number): void;
      clear(): void;
      dispose(): void;
    };
    createTransport(options: { baseUrl?: string; token?: string }): Transport;
  };
}
