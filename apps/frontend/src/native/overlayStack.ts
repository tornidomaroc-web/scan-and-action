// A tiny LIFO registry of "dismissable overlays" (bottom sheets, modals).
//
// The Android hardware back button must close the topmost open overlay before
// it navigates or backgrounds the app (see NativeBackButton). Overlays live in
// many components with their own local open-state and React portals, so instead
// of threading a global state we let each one register its close handler while
// it is open via useBackDismiss().
type CloseFn = () => void;

const stack: { id: number; close: CloseFn }[] = [];
let nextId = 1;

export function pushOverlay(close: CloseFn): () => void {
  const id = nextId++;
  stack.push({ id, close });
  return () => {
    const i = stack.findIndex((o) => o.id === id);
    if (i !== -1) stack.splice(i, 1);
  };
}

// Closes the most-recently-opened overlay. Returns true if one was closed, so
// the back-button handler knows to stop (and not also navigate/minimize).
export function closeTopOverlay(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.close();
  return true;
}
