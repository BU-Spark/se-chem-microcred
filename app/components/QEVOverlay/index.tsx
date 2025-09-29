export interface QEVOverlayProps {
  activeCue?: string;
}

export function QEVOverlay({ activeCue }: QEVOverlayProps) {
  return (
    <aside>
      <h3>QEV Overlay</h3>
      <p>{activeCue ?? 'No active cue.'}</p>
    </aside>
  );
}

export default QEVOverlay;
